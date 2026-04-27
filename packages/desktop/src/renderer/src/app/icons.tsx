import {
  Archive,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  Expand,
  FilePlus2,
  FileText,
  Folder,
  LayoutPanelLeft,
  MessageSquare,
  Minus,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  RotateCcw,
  Settings,
  SortAsc,
  Square,
  Sun,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"

function createIcon(Icon: LucideIcon, defaults: LucideProps = {}) {
  return function AppIcon(props: LucideProps) {
    return <Icon aria-hidden="true" focusable="false" {...defaults} {...props} />
  }
}

export const FolderIcon = createIcon(Folder)
export const PaperclipIcon = createIcon(Paperclip)
export const ChevronDownIcon = createIcon(ChevronDown)
export const ChevronRightIcon = createIcon(ChevronRight)
export const ExpandIcon = createIcon(Expand)
export const OpenInEditorIcon = createIcon(Expand)
export const FileTextIcon = createIcon(FileText)
export const SortIcon = createIcon(SortAsc)
export const NewItemIcon = createIcon(FilePlus2)
export const PlusIcon = createIcon(Plus)
export const SettingsIcon = createIcon(Settings)
export const LayoutSidebarLeftIcon = createIcon(LayoutPanelLeft)
export const LayoutSidebarRightIcon = createIcon(PanelRight)
export const SideChatIcon = createIcon(MessageSquare)
export const LeftSidebarCollapseIcon = createIcon(PanelLeftClose)
export const LeftSidebarExpandIcon = createIcon(PanelLeftOpen)
export const RightSidebarCollapseIcon = createIcon(PanelRightClose)
export const RightSidebarExpandIcon = createIcon(PanelRightOpen)
export const ConnectedStatusIcon = createIcon(CircleCheck)
export const DisconnectedStatusIcon = createIcon(CircleX)
export const DeleteIcon = createIcon(Trash2)
export const ArchiveIcon = createIcon(Archive)
export const MinimizeIcon = createIcon(Minus)
export const MaximizeIcon = createIcon(Square)
export const RestoreIcon = createIcon(Copy)
export const CloseIcon = createIcon(X)
export const TerminalIcon = createIcon(Terminal)
export const ArrowUpIcon = createIcon(ArrowUp)
export const StopIcon = createIcon(Square, { fill: "currentColor", strokeWidth: 0 })
export const PaletteIcon = createIcon(Palette)
export const ResetIcon = createIcon(RotateCcw)
export const SunIcon = createIcon(Sun)
export const MoonIcon = createIcon(Moon)
export const MonitorIcon = createIcon(Monitor)
