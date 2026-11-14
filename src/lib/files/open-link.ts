/** Opens a link that has to be fetched first. Call it straight from a click. */
export async function openLink(fetchUrl: () => Promise<string>): Promise<void> {
  // Opened before the wait: browsers block a new tab that doesn't directly follow the click.
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = await fetchUrl();
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
