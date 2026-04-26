export async function openExternalUrl(url: string) {
  await window.desktop?.openExternalUrl?.({ url })
}
