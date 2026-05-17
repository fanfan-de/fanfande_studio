import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Expand,
  FileDiff,
  FilePlus2,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  LayoutPanelLeft,
  LoaderCircle,
  MessageSquare,
  Minus,
  Monitor,
  Moon,
  MoreHorizontal,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pin,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Settings,
  SortAsc,
  Square,
  Sun,
  Terminal,
  Trash2,
  Wrench,
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
export const BackIcon = createIcon(ArrowLeft)
export const ForwardIcon = createIcon(ArrowRight)
export const FolderOpenIcon = createIcon(FolderOpen)
export const PaperclipIcon = createIcon(Paperclip)
export const PinIcon = createIcon(Pin)
export const CopyIcon = createIcon(Copy)
export const DownloadIcon = createIcon(Download)
export const ChevronDownIcon = createIcon(ChevronDown)
export const ChevronRightIcon = createIcon(ChevronRight)
export const ExpandIcon = createIcon(Expand)
export const OpenInEditorIcon = createIcon(Expand)
export const OpenExternalIcon = createIcon(ArrowUpRight)
export const ChangesIcon = createIcon(FileDiff)
export const PreviewIcon = createIcon(Globe)
export const FileSearchIcon = createIcon(FileSearch)
export const FileTextIcon = createIcon(FileText)
export const SortIcon = createIcon(SortAsc)
export const NewItemIcon = createIcon(FilePlus2)
export const PlusIcon = createIcon(Plus)
export const SettingsIcon = createIcon(Settings)
export const PluginIcon = createIcon(Puzzle)
export const LayoutSidebarLeftIcon = createIcon(LayoutPanelLeft)
export const LayoutSidebarRightIcon = createIcon(PanelRight)
export const LeftSidebarIcon = createIcon(PanelLeft)
export const RightSidebarIcon = createIcon(PanelRight)
export const SideChatIcon = createIcon(MessageSquare)
export const CodeModeIcon = createIcon(Code2)
export const SessionRunningIcon = createIcon(LoaderCircle)
export const LeftSidebarCollapseIcon = createIcon(PanelLeftClose)
export const LeftSidebarExpandIcon = createIcon(PanelLeftOpen)
export const RightSidebarCollapseIcon = createIcon(PanelRightClose)
export const RightSidebarExpandIcon = createIcon(PanelRightOpen)
export const ConnectedStatusIcon = createIcon(CircleCheck)
export const DisconnectedStatusIcon = createIcon(CircleX)
export const EyeIcon = createIcon(Eye)
export const EyeOffIcon = createIcon(EyeOff)
export const DeleteIcon = createIcon(Trash2)
export const MoreIcon = createIcon(MoreHorizontal)
export const ArchiveIcon = createIcon(Archive)
export const MinimizeIcon = createIcon(Minus)
export const MaximizeIcon = createIcon(Square)
export const RestoreIcon = createIcon(Copy)
export const CloseIcon = createIcon(X)
export const TerminalIcon = createIcon(Terminal)
export const ToolsIcon = createIcon(Wrench)
export const ArrowUpIcon = createIcon(ArrowUp)
export const StopIcon = createIcon(Square, { fill: "currentColor", strokeWidth: 0 })
export const PaletteIcon = createIcon(Palette)
export const ResetIcon = createIcon(RotateCcw)
export const SearchIcon = createIcon(Search)
export const SunIcon = createIcon(Sun)
export const MoonIcon = createIcon(Moon)
export const MonitorIcon = createIcon(Monitor)
