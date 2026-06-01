import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { joinClassNames } from "../shared-ui"

export interface SettingsSelectOption<TValue extends string = string> {
  value: TValue
  label: string
  disabled?: boolean
}

interface SettingsSelectProps<TValue extends string = string> {
  ariaLabel: string
  className?: string
  disabled?: boolean
  options: Array<SettingsSelectOption<TValue>>
  value: TValue
  onChange: (value: TValue) => void
}

function getFirstEnabledIndex<TValue extends string>(options: Array<SettingsSelectOption<TValue>>) {
  return options.findIndex((option) => !option.disabled)
}

function getSelectedIndex<TValue extends string>(
  options: Array<SettingsSelectOption<TValue>>,
  value: TValue,
) {
  return options.findIndex((option) => option.value === value)
}

function getNextEnabledIndex<TValue extends string>(
  options: Array<SettingsSelectOption<TValue>>,
  currentIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) return -1

  for (let offset = 1; offset <= options.length; offset += 1) {
    const nextIndex = (currentIndex + offset * direction + options.length) % options.length
    if (!options[nextIndex]?.disabled) return nextIndex
  }

  return -1
}

export function SettingsSelect<TValue extends string = string>({
  ariaLabel,
  className,
  disabled = false,
  options,
  value,
  onChange,
}: SettingsSelectProps<TValue>) {
  const listboxID = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const selectedIndex = getSelectedIndex(options, value)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(() =>
    selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex(options),
  )

  useEffect(() => {
    if (isOpen) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex(options))
  }, [isOpen, options, selectedIndex])

  useEffect(() => {
    if (!isOpen) return
    panelRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handleDocumentPointerDown(event: globalThis.PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return

      setIsOpen(false)
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown)
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown)
  }, [isOpen])

  function openSelect(index = selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex(options)) {
    if (disabled) return
    setActiveIndex(index)
    setIsOpen(true)
  }

  function closeSelect({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    setIsOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  function commitOption(index: number) {
    const option = options[index]
    if (!option || option.disabled) return

    onChange(option.value)
    closeSelect()
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const index = selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex(options)
      openSelect(index >= 0 ? index : 0)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      const lastEnabledIndex = [...options].reverse().findIndex((option) => !option.disabled)
      openSelect(lastEnabledIndex >= 0 ? options.length - 1 - lastEnabledIndex : 0)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      if (isOpen) {
        commitOption(activeIndex)
      } else {
        openSelect()
      }
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      closeSelect()
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const nextIndex = getNextEnabledIndex(options, activeIndex, event.key === "ArrowDown" ? 1 : -1)
      if (nextIndex >= 0) setActiveIndex(nextIndex)
      return
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      if (event.key === "Home") {
        setActiveIndex(getFirstEnabledIndex(options))
        return
      }

      const lastEnabledIndex = [...options].reverse().findIndex((option) => !option.disabled)
      setActiveIndex(lastEnabledIndex >= 0 ? options.length - 1 - lastEnabledIndex : -1)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      commitOption(activeIndex)
    }
  }

  return (
    <div className={joinClassNames("settings-select", className, isOpen && "is-open")}>
      <button
        ref={buttonRef}
        aria-controls={isOpen ? listboxID : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="settings-select-trigger"
        disabled={disabled}
        role="combobox"
        title={selectedOption?.label ?? ariaLabel}
        type="button"
        onClick={() => {
          if (isOpen) {
            closeSelect({ restoreFocus: false })
            return
          }

          openSelect()
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="settings-select-value">{selectedOption?.label ?? ""}</span>
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          aria-label={ariaLabel}
          className="settings-select-panel"
          id={listboxID}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            const isActive = index === activeIndex

            return (
              <button
                key={option.value}
                aria-selected={isSelected}
                className={joinClassNames(
                  "settings-select-option",
                  isSelected && "is-selected",
                  isActive && "is-active",
                )}
                disabled={option.disabled}
                role="option"
                tabIndex={-1}
                type="button"
                onClick={() => commitOption(index)}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index)
                }}
              >
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
