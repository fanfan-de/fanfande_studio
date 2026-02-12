Project.Info
```typescript
export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
      icon: z
        .object({
          url: z.string().optional(),
          override: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        initialized: z.number().optional(),
      }),
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>
```
#id 
非git项目时 “global”
git项目时是第一次 commit的 hash
#worktree
工作树根目录，即当前git项目的根目录（并非当前session打开的文件夹）
没有git根目录就是global，所有的非git项目都属于同一个global项目，global
#vcs
版本控制类型，默认git，可选
#name
项目name，可选
#icon 
图标
#time
创建时间，更新时间，初始化时间
#sandboxes
sandbox列表，如果当前项目有worktree分支，sandboxes是所有的分支worktree的根路径
# Event
```typescript
  export const Event = {
    Updated: BusEvent.define("project.updated", Info),
  }
```