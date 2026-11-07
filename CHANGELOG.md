# Changelog

## 0.2.0

- If the file or folder does not exist, the mod does not link the path. Paths with spaces now link whole, and web routes such as `/api/users` stay plain text.
- The mod now finds UNC paths, Git Bash paths such as `/c/Users/me`, and Windows relative paths such as `.\src\a.ts`.
- On Windows, Explorer now opens with a visible window. Before, Claude Code started it hidden.
- Security fix: the path goes to PowerShell as data in an environment variable, not as script text. In 0.1.0 and the first 0.2.0 commits, a click on a crafted path with curly quotes ran the code in that path.
- If the launch fails, the mod shows a message. The "Opening" message shows only after the mod finds the file.
- Replies with tables, GitHub alerts or code fences go to the other renderers, such as diagram mods, with the links added.
- The mod does nothing on the mobile app or on summary blocks.
- `/clickable-paths` takes effect at once.
- The "Show in folder" line now shows only under Write, Edit and NotebookEdit rows, not under Read rows.

## 0.1.0

- First version. The mod makes file paths in replies clickable and adds a "Show in folder" line under file tool rows.
