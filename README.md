# clickable-paths

clickable-paths is a Claude Code mod. It turns file paths in Claude's replies into links. When you click a link, the system file browser opens with the file selected. On Windows this is Explorer, on macOS it is Finder, and on Linux it is the default file manager.

The mod links these paths:

- Absolute Windows paths, such as `C:\Users\me\out.png` or `C:/Users/me/out.png`.
- UNC paths (network share paths), such as `\\server\share\file.txt`.
- Absolute POSIX paths, such as `/home/me/out.png`.
- Relative paths with a file extension, such as `hooks/register.tsx:40`. The mod resolves these against the session's working directory.

The mod does not change paths inside fenced code blocks, URLs or existing markdown links. Under each Write, Edit, Read and NotebookEdit tool row, the mod adds a "Show in folder" link to the file that the tool used.

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

- In the fullscreen terminal, click a link once.
- In other terminals, ctrl+click the link.
- To turn the links off or on, type `/clickable-paths`.

If a reply holds a code fence, the mod adds the links but lets the other renderers draw the block. Diagram mods are an example of such renderers. In that case the terminal opens the link with its own behavior.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT
