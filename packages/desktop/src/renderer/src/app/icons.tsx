import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  Expand,
  FilePlus2,
  Folder,
  LayoutPanelLeft,
  Menu,
  Minus,
  PanelRight,
  Paperclip,
  Plus,
  Settings,
  SortAsc,
  Square,
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
export const SortIcon = createIcon(SortAsc)
export const NewItemIcon = createIcon(FilePlus2)
export const PlusIcon = createIcon(Plus)
export const SettingsIcon = createIcon(Settings)
export const NavPlaceholderIcon = createIcon(Menu)
export const LayoutSidebarLeftIcon = createIcon(LayoutPanelLeft)
export const LayoutSidebarRightIcon = createIcon(PanelRight)
export const ConnectedStatusIcon = createIcon(CircleCheck)
export const DisconnectedStatusIcon = createIcon(CircleX)
export const DeleteIcon = createIcon(Trash2)
export const MinimizeIcon = createIcon(Minus)
export const MaximizeIcon = createIcon(Square)
export const RestoreIcon = createIcon(Copy)
export const CloseIcon = createIcon(X)
export const TerminalIcon = createIcon(Terminal)
export const ArrowUpIcon = createIcon(ArrowUp)
