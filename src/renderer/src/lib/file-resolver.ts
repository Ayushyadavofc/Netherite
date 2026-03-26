/**
 * Resolves a wikilink target to a full path or URL using the vault index.
 * Supports notes, images, audio, and video.
 */

export interface ResolvedFile {
  type: 'note' | 'image' | 'audio' | 'video';
  path: string;
  name: string;
}

export function resolveWikilink(
  target: string,
  notes: any[], // Use the Note interface from workspace
  vaultPath: string | null
): ResolvedFile | null {
  if (!target) return null;

  // Normalize target
  const cleanTarget = target.trim();
  const lowerTarget = cleanTarget.toLowerCase();

  // 1. Try to find a note with this title
  const note = notes.find(n => n.title.toLowerCase() === lowerTarget);
  if (note) {
    return {
      type: 'note',
      path: note.fullPath || note.path || '',
      name: note.title
    };
  }

  // 2. Handle attachments if vaultPath is available
  if (vaultPath) {
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cleanTarget);
    const isVideo = /\.(mp4|webm|ogg)$/i.test(cleanTarget);
    const isAudio = /\.(mp3|wav|m4a)$/i.test(cleanTarget);

    if (isImage || isVideo || isAudio) {
      const type = isImage ? 'image' : isVideo ? 'video' : 'audio';
      // In this app, attachments are usually in the 'attachments' folder
      const fileName = cleanTarget.split('/').pop() || cleanTarget;
      let finalPath = `${vaultPath.replace(/\\/g, '/')}/attachments/${fileName}`;
      
      // Clean up path for Windows
      if (finalPath.startsWith('/C:')) finalPath = finalPath.slice(1);
      
      return {
        type,
        path: `local-file:///${finalPath}`,
        name: fileName
      };
    }
  }

  // File not found
  return null;
}
