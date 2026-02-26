#!/usr/bin/env bun

/**
 * �?Structurizr DSL 转换�?Mermaid 图表
 * 
 * 此脚本解�?model.dsl 文件并生�?Mermaid 格式的架构图
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// DSL 解析器接�?
interface DslElement {
  type: string;
  id: string;
  name: string;
  description: string;
  tags: string[];
  children?: DslElement[];
}

interface DslRelationship {
  source: string;
  target: string;
  description: string;
}

interface DslModel {
  elements: DslElement[];
  relationships: DslRelationship[];
}

interface DslView {
  type: string;
  name: string;
  elements: string[];
}

interface DslWorkspace {
  model: DslModel;
  views: DslView[];
}

/**
 * 简单的 DSL 解析�?
 * 注意：这是一个简化版本，只处理基本结�?
 */
function parseDsl(content: string): DslWorkspace {
  const lines = content.split('\n');
  const model: DslModel = { elements: [], relationships: [] };
  const views: DslView[] = [];
  let currentView: DslView | null = null;
  let inModel = false;
  let inViews = false;
  let inElement = false;
  let currentElement: DslElement | null = null;
  let braceDepth = 0;
  let elementStack: DslElement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;

    // 检查工作区开�?
    if (line.startsWith('workspace')) {
      // 跳过工作区定�?
      continue;
    }

    // 检查模型开�?
    if (line === 'model {') {
      inModel = true;
      continue;
    }

    // 检查视图开�?
    if (line === 'views {') {
      inViews = true;
      inModel = false;
      continue;
    }

    // 处理元素定义
    if (inModel) {
      // 人员定义
      if (line.includes('= person')) {
        const match = line.match(/(\w+)\s*=\s*person\s*"([^"]+)"\s*"([^"]*)"/);
        if (match) {
          const element: DslElement = {
            type: 'person',
            id: match[1],
            name: match[2],
            description: match[3] || '',
            tags: ['人员']
          };
          model.elements.push(element);
        }
      }
      // 软件系统定义
      else if (line.includes('= softwareSystem')) {
        const match = line.match(/(\w+)\s*=\s*softwareSystem\s*"([^"]+)"\s*"([^"]*)"/);
        if (match) {
          const element: DslElement = {
            type: 'softwareSystem',
            id: match[1],
            name: match[2],
            description: match[3] || '',
            tags: ['外部系统']
          };
          model.elements.push(element);
          currentElement = element;
          elementStack.push(element);
        }
      }
      // 容器定义
      else if (line.includes('= container')) {
        const match = line.match(/(\w+)\s*=\s*container\s*"([^"]+)"\s*"([^"]*)"\s*"([^"]*)"/);
        if (match) {
          const element: DslElement = {
            type: 'container',
            id: match[1],
            name: match[2],
            description: match[3] || '',
            tags: [match[4] || '']
          };
          model.elements.push(element);
          currentElement = element;
          elementStack.push(element);
        }
      }
      // 组件定义
      else if (line.includes('= component')) {
        const match = line.match(/(\w+)\.(\w+)\s*=\s*component\s*"([^"]+)"\s*"([^"]*)"/);
        if (match) {
          const element: DslElement = {
            type: 'component',
            id: `${match[1]}.${match[2]}`,
            name: match[3],
            description: match[4] || '',
            tags: []
          };
          model.elements.push(element);
        }
      }
      // 关系定义
      else if (line.includes('->')) {
        const match = line.match((\w+(?:\.\w+)*)\s*->\s*(\w+(?:\.\w+)*)\s*"([^"]*)")/);
        if (match) {
          const relationship: DslRelationship = {
            source: match[1],
            target: match[2],
            description: match[3] || ''
          };
          model.relationships.push(relationship);
        }
      }
      // 标签定义
      else if (line.includes('tags')) {
        const match = line.match(/tags\s*"([^"]+)"/);
        if (match && currentElement) {
          currentElement.tags.push(match[1]);
        }
      }
    }

    // 处理视图
    if (inViews) {
      // 系统上下文图
      if (line.startsWith('systemContext')) {
        const match = line.match(/systemContext\s+(\w+)\s+"([^"]+)"/);
        if (match) {
          currentView = {
            type: 'systemContext',
            name: match[2],
            elements: []
          };
          views.push(currentView);
        }
      }
      // 容器�?
      else if (line.startsWith('container')) {
        const match = line.match(/container\s+(\w+)\s+"([^"]+)"/);
        if (match) {
          currentView = {
            type: 'container',
            name: match[2],
            elements: []
          };
          views.push(currentView);
        }
      }
      // 组件�?
      else if (line.startsWith('component')) {
        const match = line.match(/component\s+(\w+(?:\.\w+)*)\s+"([^"]+)"/);
        if (match) {
          currentView = {
            type: 'component',
            name: match[2],
            elements: []
          };
          views.push(currentView);
        }
      }
      // 包含元素
      else if (line === 'include *' && currentView) {
        // 包含所有元�?
        currentView.elements = model.elements.map(e => e.id);
      }
    }
  }

  return { model, views };
}

/**
 * 生成 Mermaid 图表
 */
function generateMermaid(model: DslModel, viewType: string = 'container'): string {
  let mermaid = 'graph TB\n\n';
  
  // 颜色定义
  mermaid += '    %% 颜色定义\n';
  mermaid += '    classDef userInterface fill:#e1f5fe,stroke:#01579b,stroke-width:2px\n';
  mermaid += '    classDef coreBusiness fill:#f3e5f5,stroke:#4a148c,stroke-width:2px\n';
  mermaid += '    classDef serviceLayer fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px\n';
  mermaid += '    classDef dataLayer fill:#fff3e0,stroke:#e65100,stroke-width:2px\n';
  mermaid += '    classDef extensionLayer fill:#fce4ec,stroke:#880e4f,stroke-width:2px\n';
  mermaid += '    classDef external fill:#f5f5f5,stroke:#616161,stroke-width:2px\n';
  mermaid += '    classDef person fill:#fff,stroke:#000,stroke-width:2px,shape:person\n\n';
  
  // 标题
  mermaid += '    %% 标题\n';
  mermaid += '    subgraph "OpenCode 架构�?- 基于 C4 模型"\n\n';
  
  // 按类型分组元�?
  const persons = model.elements.filter(e => e.type === 'person');
  const externalSystems = model.elements.filter(e => e.tags.includes('外部系统'));
  const uiLayer = model.elements.filter(e => e.tags.includes('用户接口�?));
  const coreLayer = model.elements.filter(e => e.tags.includes('核心业务�?));
  const serviceLayer = model.elements.filter(e => e.tags.includes('服务�?));
  const dataLayer = model.elements.filter(e => e.tags.includes('数据�?));
  const extensionLayer = model.elements.filter(e => e.tags.includes('扩展�?));
  
  // 人员
  if (persons.length > 0) {
    mermaid += '        %% 人员\n';
    mermaid += '        subgraph Persons["人员"]\n';
    for (const person of persons) {
      const safeId = person.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${person.name}<br/>${person.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  // 外部系统
  if (externalSystems.length > 0) {
    mermaid += '        %% 外部系统\n';
    mermaid += '        subgraph External["外部系统"]\n';
    for (const system of externalSystems) {
      const safeId = system.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${system.name}<br/>${system.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  // 用户接口�?
  if (uiLayer.length > 0) {
    mermaid += '        %% 用户接口层\n';
    mermaid += '        subgraph UI_Layer["用户接口�?]\n';
    for (const element of uiLayer) {
      const safeId = element.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${element.name}<br/>${element.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  // 核心业务�?
  if (coreLayer.length > 0) {
    mermaid += '        %% 核心业务层\n';
    mermaid += '        subgraph Core_Layer["核心业务�?]\n';
    for (const element of coreLayer) {
      const safeId = element.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${element.name}<br/>${element.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  // 服务�?
  if (serviceLayer.length > 0) {
    mermaid += '        %% 服务层\n';
    mermaid += '        subgraph Service_Layer["服务�?]\n';
    for (const element of serviceLayer) {
      const safeId = element.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${element.name}<br/>${element.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  // 数据�?
  if (dataLayer.length > 0) {
    mermaid += '        %% 数据层\n';
    mermaid += '        subgraph Data_Layer["数据�?]\n';
    for (const element of dataLayer) {
      const safeId = element.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${element.name}<br/>${element.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  // 扩展�?
  if (extensionLayer.length > 0) {
    mermaid += '        %% 扩展层\n';
    mermaid += '        subgraph Extension_Layer["扩展�?]\n';
    for (const element of extensionLayer) {
      const safeId = element.id.replace(/\./g, '_');
      mermaid += `            ${safeId}["${element.name}<br/>${element.description}"]\n`;
    }
    mermaid += '        end\n\n';
  }
  
  mermaid += '    end\n\n';
  
  // 应用样式
  mermaid += '    %% 组件样式应用\n';
  if (persons.length > 0) {
    const personIds = persons.map(p => p.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${personIds} person\n`;
  }
  if (externalSystems.length > 0) {
    const systemIds = externalSystems.map(s => s.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${systemIds} external\n`;
  }
  if (uiLayer.length > 0) {
    const uiIds = uiLayer.map(e => e.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${uiIds} userInterface\n`;
  }
  if (coreLayer.length > 0) {
    const coreIds = coreLayer.map(e => e.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${coreIds} coreBusiness\n`;
  }
  if (serviceLayer.length > 0) {
    const serviceIds = serviceLayer.map(e => e.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${serviceIds} serviceLayer\n`;
  }
  if (dataLayer.length > 0) {
    const dataIds = dataLayer.map(e => e.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${dataIds} dataLayer\n`;
  }
  if (extensionLayer.length > 0) {
    const extensionIds = extensionLayer.map(e => e.id.replace(/\./g, '_')).join(',');
    mermaid += `    class ${extensionIds} extensionLayer\n`;
  }
  
  mermaid += '\n';
  
  // 关系
  mermaid += '    %% 数据流和依赖关系\n\n';
  let relCount = 0;
  
  for (const rel of model.relationships) {
    const sourceId = rel.source.replace(/\./g, '_');
    const targetId = rel.target.replace(/\./g, '_');
    const desc = rel.description ? `|"${rel.description}"|` : '';
    
    mermaid += `    ${sourceId} ${desc}--> ${targetId}\n`;
    relCount++;
  }
  
  if (relCount === 0) {
    // 添加一些默认关�?
    mermaid += '    %% 默认关系（如果DSL中没有定义）\n';
    mermaid += '    developer --> cli\n';
    mermaid += '    cli --> http_server\n';
    mermaid += '    http_server --> instance_mgmt\n';
    mermaid += '    instance_mgmt --> session_processor\n';
  }
  
  return mermaid;
}

/**
 * 主函�?
 */
async function main() {
  try {
    // 读取 DSL 文件
    const dslPath = join(process.cwd(), 'model.dsl');
    const dslContent = await readFile(dslPath, 'utf-8');
    
    console.log('正在解析 DSL 文件...');
    
    // 解析 DSL
    const workspace = parseDsl(dslContent);
    
    console.log(`解析完成：找�?${workspace.model.elements.length} 个元素和 ${workspace.model.relationships.length} 个关系`);
    console.log(`找到 ${workspace.views.length} 个视图`);
    
    // 生成 Mermaid 图表
    const mermaid = generateMermaid(workspace.model);
    
    // 输出文件
    const outputPath = join(process.cwd(), 'model-converted.mermaid');
    await writeFile(outputPath, mermaid);
    
    console.log(`Mermaid 图表已生�? ${outputPath}`);
    
    // 同时生成一个简化的版本
    const simplifiedMermaid = `graph TB
    %% OpenCode 简化架构图
    subgraph "OpenCode 系统架构"
        subgraph "用户接口�?
            cli["CLI 命令行界�?]
            tui["TUI 终端界面"]
            web_ui["Web 界面"]
        end
        
        subgraph "核心业务�?
            session_processor["SessionProcessor"]
            tool_system["工具系统"]
            permission_system["权限系统"]
            agent_system["Agent 系统"]
        end
        
        subgraph "服务�?
            http_server["HTTP 服务�?]
            event_bus["事件总线"]
            mcp_integration["MCP 集成"]
        end
        
        subgraph "数据�?
            instance_mgmt["Instance 管理"]
            storage_system["存储系统"]
            config_mgmt["配置管理"]
        end
        
        subgraph "扩展�?
            plugin_system["插件系统"]
            skill_system["技能系�?]
            provider_system["Provider 系统"]
        end
        
        subgraph "外部系统"
            ai_providers["AI 提供�?]
            git["Git 版本控制"]
            sqlite["SQLite 数据�?]
        end
    end
    
    %% 关键关系
    cli --> http_server
    tui --> http_server
    web_ui --> http_server
    
    http_server --> instance_mgmt
    instance_mgmt --> session_processor
    
    session_processor --> tool_system
    session_processor --> provider_system
    
    tool_system --> git
    provider_system --> ai_providers
    
    %% 样式
    classDef ui fill:#e1f5fe,stroke:#01579b
    classDef core fill:#f3e5f5,stroke:#4a148c
    classDef service fill:#e8f5e8,stroke:#1b5e20
    classDef data fill:#fff3e0,stroke:#e65100
    classDef extension fill:#fce4ec,stroke:#880e4f
    classDef external fill:#f5f5f5,stroke:#616161
    
    class cli,tui,web_ui ui
    class session_processor,tool_system,permission_system,agent_system core
    class http_server,event_bus,mcp_integration service
    class instance_mgmt,storage_system,config_mgmt data
    class plugin_system,skill_system,provider_system extension
    class ai_providers,git,sqlite external`;
    
    const simplifiedPath = join(process.cwd(), 'model-simplified.mermaid');
    await writeFile(simplifiedPath, simplifiedMermaid);
    
    console.log(`简化版本已生成: ${simplifiedPath}`);
    console.log('\n您可以使用以下方式查看图表：');
    console.log('1. 在支�?Mermaid �?Markdown 编辑器中打开文件');
    console.log('2. 使用在线 Mermaid 编辑器：https://mermaid.live/');
    console.log('3. 使用 VS Code �?Mermaid 插件预览');
    
  } catch (error) {
    console.error('转换过程中出�?', error);
    process.exit(1);
  }
}

// 运行主函�?
if (import.meta.main) {
  main();
}

export { parseDsl, generateMermaid };
