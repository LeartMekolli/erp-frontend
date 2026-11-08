import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";

/** A short-lived link to one version of a file (`file.read`). */
export async function downloadUrl(fileId: string, versionId: string): Promise<string> {
  const { data, error, response } = await api.GET("/files/{id}/versions/{versionId}/url", {
    params: { path: { id: fileId, versionId } },
  });
  if (!data) throw problemFrom(error, response);
  return data.url;
}

/** Opens a file in a new tab, or here if the browser refuses one. Call it straight from a click. */
export function openFile(fileId: string, versionId: string): Promise<void> {
  return openLink(() => downloadUrl(fileId, versionId));
}

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
