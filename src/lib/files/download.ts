import { api } from "@/lib/api/client";
import { problemFrom } from "@/lib/api/problem";
import { openLink } from "@/lib/files/open-link";

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
