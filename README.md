# Comments Manager for Obsidian

A powerful Obsidian plugin that helps you manage and navigate comments in your notes through a dedicated side panel.

## Features

- **📋 Side Panel View**: View all comments in a hierarchical tree structure organized by headers
- **🔍 Search & Filter**: Quickly find specific comments with real-time search and highlighting
- **✏️ In-Panel Editing**: Edit comments directly in the side panel or navigate to edit in the document
- **🗂️ Smart Organization**: Comments are grouped under their nearest preceding header, just like an outline
- **🔄 Flexible Navigation**: Click comments to jump to their location in the document
- **⚡ Collapse/Expand**: Individual section control plus global expand/collapse toggle
- **🎛️ Customizable**: Configure comment prefix, default view state, and startup behavior
- **💾 State Preservation**: Maintains your manual expansions when navigating between comments

## Installation

### Manual Installation

1. Download the latest release files (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder called `obsidian-comments-manager` in your vault's `.obsidian/plugins/` directory
3. Place the downloaded files in this folder
4. Reload Obsidian and enable the plugin in Settings → Community Plugins
5. Or use obsidian BRAT plugin with github link to this repo

### Development Installation

1. Clone this repository into your vault's `.obsidian/plugins/` directory:
   ```bash
   git clone https://github.com/yourusername/obsidian-comments-manager.git
   ```
2. Navigate to the plugin directory:
   ```bash
   cd obsidian-comments-manager
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the plugin:
   ```bash
   npm run build
   ```
5. Reload Obsidian and enable the plugin

## Usage

### Basic Usage

1. **Open Comments Panel**: Click the `%` icon in the ribbon or use the command palette (`Ctrl+P` → "Toggle Comments Panel")
2. **Add Comments**: Use the command "Insert comment" or manually add comments with your configured prefix (default: `%% Your comment %%`)
3. **Navigate**: Click on any comment or header in the panel to jump to that location in your document
4. **Edit**: Click directly on comment text to edit in-place, or click the comment area to edit in the document

### Comment Format

By default, comments use the format:
```
%% This is a comment %%
```

You can customize the comment prefix in the plugin settings.

### Panel Controls

- **Toggle Button** (`+`/`-`): Expand or collapse all sections globally
- **Section Icons** (`▶`/`▼`): Expand or collapse individual sections
- **Search Box**: Filter comments in real-time
- **Comment Actions**: Save, Cancel, or Delete when editing

### Navigation Behavior

- **Comment Text**: Click to edit in-place in the panel
- **Comment Area**: Click to navigate to the comment location in the document
- **Headers**: Click to jump to that header in the document
- **Manual Expansions**: Your expanded sections are preserved when navigating

## Settings

Access settings via Settings → Comments Manager:

- **Comment Prefix**: Characters used to mark comments (default: `%%`)
- **Open Panel on Startup**: Automatically open the comments panel when Obsidian starts
- **Default Collapsed View**: Start with the panel in collapsed state (showing only headers)
- **Debug Mode**: Enable console logging for troubleshooting

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### File Structure

- `main.ts` - Main plugin code
- `styles.css` - Plugin styling
- `manifest.json` - Plugin metadata
- `esbuild.config.mjs` - Build configuration

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you find this plugin helpful, consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs or requesting features in the Issues section
- 💡 Contributing improvements

## Images

**Example Note**
![ocm-image-1](https://github.com/user-attachments/assets/df507278-c1da-4e32-83c4-c014d072b0e1)

**Comments Panel-Expanded by Default**
![ocm-image-2](https://github.com/user-attachments/assets/2d9d1355-ca0c-48cc-b3a9-604e56f8de03)

**Comments Panel-Collapsed**
![ocm-image-3](https://github.com/user-attachments/assets/b7d1f21e-0e1d-44ca-9be0-bc7379c2f463)

**Comments Panel-Manually Expanded**
![ocm-image-4](https://github.com/user-attachments/assets/6647de02-2b54-4fae-aae7-872fda07965e)

**Comments Panel-Edit Comment in Side Panel**
![ocm-image-5](https://github.com/user-attachments/assets/63a38a4d-994e-4e40-85df-3f81ac52f89d)

**Reading View**
![ocm-image-6](https://github.com/user-attachments/assets/d6edad67-d087-48a1-b88e-8f78e6ff5334)

**Export to pdf**
![ocm-image-7](https://github.com/user-attachments/assets/55958ce0-e9ad-4c96-8d10-1f8e97f7cb7e)

## Changelog

### Version 1.0.0
- Initial release
- Side panel with hierarchical comment organization
- Search and filter functionality
- In-panel and in-document editing
- Customizable settings
- State preservation for manual expansions

### Version 1.1.0
- Amended code to allow for multi-line comments where the comment start and ending markers (default "%%") are on different lines
