# clickable-paths

clickable-paths is a Claude Code mod. It turns file paths in Claude's replies into links. When you click a link, the system file browser opens with the file selected. On Windows this is Explorer, on macOS it is Finder, and on Linux it is the default file manager.

The mod links these paths:

- Absolute Windows paths, such as `C:\Users\me\out.png` or `C:/Users/me/out.png`. The mod also finds paths with spaces, such as `C:\Program Files\app\log.txt`.
- UNC paths (network share paths), such as `\\server\share\file.txt`.
- Absolute POSIX paths, such as `/home/me/out.png`.
- Git Bash paths, such as `/c/Users/me/out.png`. In a Windows session, the mod changes these to `C:\Users\me\out.png`.
- Relative paths with a file extension, such as `hooks/register.tsx:40` or `.\src\a.ts`. The mod resolves these against the folder where the session started.

If the file or folder does not exist, the mod does not link the path. It cannot check UNC paths, so it links them without a check. The mod does not change paths inside fenced code blocks, URLs or existing markdown links. Under each Write, Edit and NotebookEdit tool row, the mod adds a "Show in folder" link to the file that the tool changed.

The mod changes only what the transcript shows. The stored messages and what the model reads stay the same.

## Install

At the prompt of a Claude Code terminal session, type:

```
/plugin install clickable-paths --marketplace alazc/clickable-paths
```

From a shell:

```
claude plugin install clickable-paths --marketplace alazc/clickable-paths
```

Answer `y` to add the marketplace, then select a scope.

In the desktop app, `/plugin` does not run. Click + next to the prompt box, then Plugins. Add the marketplace `alazc/clickable-paths`, then add the plugin.

This repository is private. To install the mod, you must be able to read the repository on GitHub, and your computer must have a git credential for github.com. For example, you can use an SSH key, or run `gh auth login` and then `gh auth setup-git`. The install does not ask for a credential.

## Use

In the fullscreen terminal and in the desktop app, click a link once. The file browser then opens with the file selected.

In a terminal that is not fullscreen, the terminal handles a ctrl+click on the link, not the mod. The terminal opens the file with its default program, and the file browser does not open.

To turn the links off or on, type `/clickable-paths`. The change shows at once and stays for later sessions.

If a reply holds a code fence, a table or a GitHub alert, the mod adds the links. Then the other renderers draw the block, for example diagram mods. In that case the terminal opens the link with its own behavior.

On the mobile app the mod does nothing. There, a click opens the file browser on your computer, not on the phone.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT
