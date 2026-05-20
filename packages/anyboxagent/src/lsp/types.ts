export interface JsonRpcErrorObject {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number | string
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: number | string | null
  result?: unknown
  error?: JsonRpcErrorObject
}

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface LocationLink {
  originSelectionRange?: Range
  targetUri: string
  targetRange: Range
  targetSelectionRange?: Range
}

export interface TextDocumentIdentifier {
  uri: string
}

export interface TextDocumentItem extends TextDocumentIdentifier {
  languageId: string
  version: number
  text: string
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number
}

export interface MarkupContent {
  kind: "plaintext" | "markdown"
  value: string
}

export interface MarkedCodeString {
  language: string
  value: string
}

export type HoverContents =
  | string
  | MarkedCodeString
  | MarkupContent
  | Array<string | MarkedCodeString>

export interface Hover {
  contents: HoverContents
  range?: Range
}

export interface SymbolInformation {
  name: string
  kind: number
  tags?: number[]
  deprecated?: boolean
  containerName?: string
  location: Location
}

export interface WorkspaceSymbol {
  name: string
  kind: number
  tags?: number[]
  deprecated?: boolean
  containerName?: string
  location: Location | { uri: string }
  data?: unknown
}
