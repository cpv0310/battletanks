type ElementProps = {
  className?: string
  text?: string
  title?: string
  html?: never
}

/** Create an element with class/text and append children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: ReadonlyArray<HTMLElement | string> = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (props.className) element.className = props.className
  if (props.text !== undefined) element.textContent = props.text
  if (props.title !== undefined) element.title = props.title
  for (const child of children) {
    element.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return element
}

export function button(
  label: string,
  onClick: () => void,
  className = 'btn',
): HTMLButtonElement {
  const element = el('button', { className, text: label })
  element.type = 'button'
  element.addEventListener('click', onClick)
  return element
}

export function option(value: string, label: string): HTMLOptionElement {
  const element = el('option', { text: label })
  element.value = value
  return element
}
