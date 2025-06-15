# Comments Manager for Obsidian

A powerful Obsidian plugin that helps you manage and navigate comments in your notes through a dedicated side panel with dual view modes and advanced features.

## ✨ Features

### 📋 Dual View Modes
- **Outliner View**: Hierarchical tree structure organized by headers - perfect for understanding document structure
- **List View**: Flat numbered list in document order - ideal for sequential comment review
- **Quick Toggle**: Switch between views instantly with dedicated buttons
- **Saved Preference**: Your view mode choice is remembered across sessions

### 🔍 Advanced Comment Management
- **Smart Organization**: Comments grouped under their nearest preceding header (outliner mode)
- **Real-time Search**: Find specific comments with instant filtering and highlighting
- **In-Panel Editing**: Edit comments directly in the side panel with auto-resize support
- **Quick Navigation**: Click any comment to jump to its location in the document
- **Header Navigation**: Click headers to navigate to document sections

### 🖨️ Print Mode
- **Temporary Conversion**: Convert all comments to visible callouts for PDF export
- **Safe Operation**: No permanent file modification - easily restore original content
- **Preview Modal**: See exactly how your document will look before exporting
- **Context Awareness**: Callouts include header context and line numbers
- **Perfect for**: Academic papers, document reviews, client presentations

### 📝 Individual Comment Conversion
- **Selective Conversion**: Convert specific comments to permanent callouts
- **Custom Titles**: Add meaningful titles like "Important Note", "Question", "TODO"
- **Smart Defaults**: Automatic context from nearby headers when no title provided
- **Permanent Change**: Great for making feedback visible or creating action items

### ⚡ Enhanced User Experience
- **Collapse/Expand Control**: Individual section control plus global toggle (outliner mode)
- **State Preservation**: Manual expansions maintained when navigating
- **Multi-line Support**: Full support for complex, multi-line comments
- **Customizable Settings**: Configure comment prefix, startup behavior, and more
- **Modern UI**: Clean interface with Lucide icons throughout

## 🚀 Installation

### Method 1: Manual Installation
1. Download the latest release files (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder called `obsidian-comments-manager` in your vault's `.obsidian/plugins/` directory
3. Place the downloaded files in this folder
4. Reload Obsidian and enable the plugin in Settings → Community Plugins

### Method 2: BRAT Plugin
1. Install the BRAT plugin if you haven't already
2. Add this repository URL: `https://github.com/BigGHS/obsidian-comments-manager`
3. Enable the plugin in Community Plugins

### Method 3: Development Installation
```bash
# Clone into your vault's plugins directory
git clone https://github.com/BigGHS/obsidian-comments-manager.git

# Navigate to plugin directory
cd obsidian-comments-manager

# Install dependencies and build
npm install
npm run build
```

## 📖 Usage Guide

### Basic Usage

1. **Open Comments Panel**: Click the `%` icon in the ribbon or use Command Palette (`Ctrl+P` → "Toggle Comments Panel")
2. **Add Comments**: Use the command "Insert comment" or manually add: `%% Your comment %%`
3. **Switch Views**: Use the view toggle buttons at the top of the panel
4. **Navigate**: Click any comment or header to jump to that location
5. **Edit**: Click comment text to edit in-place, or click comment area to edit in document

### View Modes

#### 🔲 Outliner View
- Comments organized in hierarchical tree by headers
- Collapse/expand individual sections or all at once
- Shows comment counts per section
- Perfect for understanding document structure
- Great for complex documents with multiple sections

#### 📋 List View  
- Flat numbered list in document order
- Clean, sequential layout
- No grouping or hierarchy
- Ideal for quick comment review
- Perfect for final editing passes

### Print Mode Workflow

#### For PDF Export:
1. **Activate**: Click the printer icon or use command "Activate Print Mode"
2. **Preview**: Review how comments will appear as callouts
3. **Export**: Click "Export to PDF" to prepare document
4. **Generate PDF**: Use Obsidian's built-in PDF export (`Ctrl+P`)
5. **Restore**: Click the notice or use the restore command when done

#### Best Practices:
- Use for academic papers, reports, and formal documents
- Great for sharing annotated content with collaborators
- Perfect for creating documentation with visible feedback
- Ideal for client presentations with embedded notes

### Individual Comment Conversion

#### When to Use:
- Make specific feedback permanently visible
- Convert research notes to action items
- Highlight critical information for team members
- Create permanent callouts for important references

#### How to Convert:
1. **Click Convert Icon**: Use the edit icon next to any comment
2. **Add Custom Title**: Enter meaningful title or leave blank for default
3. **Confirm**: Comment becomes a permanent, visible callout
4. **Result**: Callout appears in both editor and exported documents

### Advanced Features

#### Search & Filtering
- **Real-time Search**: Type in search box for instant filtering
- **Works in Both Views**: Search functionality adapts to current view mode
- **Highlighted Results**: Matching text highlighted in yellow
- **Clear Function**: One-click search clearing

#### Navigation & Editing
- **Quick Jump**: Click comments to navigate to source location
- **Header Navigation**: Click headers to jump to sections (outliner mode)
- **In-place Editing**: Edit comments without leaving the panel
- **Auto-resize**: Multi-line comments expand automatically
- **Keyboard Shortcuts**: 
  - `Enter`: Save single-line edits
  - `Ctrl+Enter`: Save multi-line edits  
  - `Escape`: Cancel editing

## ⚙️ Settings

### General Settings
- **Comment Prefix**: Characters used to mark comments (default: `%%`)
- **Open Panel on Startup**: Auto-open panel when Obsidian starts
- **Default View Mode**: Choose outliner or list as startup view
- **Default Collapsed View**: Start outliner mode collapsed (headers only)
- **Debug Mode**: Enable console logging for troubleshooting

### Print Mode Settings
- **Callout Type**: Type of callout for conversions (e.g., comment, note, info)
- **Include Author**: Future feature for author information
- **Include Timestamp**: Future feature for timestamp data

## 🎯 Use Cases

### Academic Writing
```markdown
# Research Paper

%% Need to find more sources for this section %%
## Literature Review
%% Smith (2023) contradicts Johnson (2022) - need to address %%

## Methodology
%% Consider adding qualitative methods %%
```
- **Hidden Comments**: Keep research notes private during writing
- **Print Mode**: Convert to visible callouts for supervisor review
- **Individual Conversion**: Make critical notes permanent

### Document Review & Collaboration
```markdown
# Project Proposal

%% Great introduction! Very clear. %%
## Executive Summary
%% Consider adding budget overview here %%

%% URGENT: Need legal review before submission %%
## Implementation Plan
```
- **Review Comments**: Add feedback and suggestions
- **Print Mode**: Generate PDFs with all feedback visible
- **Selective Visibility**: Convert priority comments to permanent callouts

### Content Creation & Editing
```markdown
# Blog Post: AI Trends

%% Update with latest ChatGPT developments %%
## Introduction
%% Add hook - maybe start with statistic? %%

%% TODO: Add images and charts %%
## Key Trends
```
- **Editorial Notes**: Track ideas and improvements
- **List View**: Review all todos sequentially  
- **Convert to Actions**: Turn comments into permanent task callouts

### Project Documentation
```markdown
# API Documentation

%% Version 2.0 will deprecate this endpoint %%
## Authentication
%% Add rate limiting examples %%

%% Client feedback: Need more error code examples %%
## Error Handling
```
- **Development Notes**: Track implementation details
- **Client Presentations**: Use Print Mode for client-facing docs
- **Action Items**: Convert feedback to permanent improvement notes

## 🎨 Customization

### Comment Format
Default format: `%% Your comment %%`

Custom prefixes supported:
- `<!-- Comment -->` for HTML-style
- `// Comment //` for code-style  
- `** Comment **` for bold-style

### Callout Types
Customize callout appearance in Print Mode:
- `comment` (default) - Standard comment styling
- `note` - Note-style callouts
- `info` - Information callouts
- `warning` - Warning-style callouts
- `question` - Question callouts

### Keyboard Shortcuts
Add custom shortcuts in Obsidian settings:
- Toggle Comments Panel
- Insert Comment  
- Activate Print Mode

## 🔧 Commands

Access via Command Palette (`Ctrl+P`):

- **Toggle Comments Panel**: Open/close the comments side panel
- **Insert Comment**: Add a new comment at cursor position
- **Activate Print Mode**: Convert all comments to callouts for PDF export
- **Restore Original Content**: Restore document after Print Mode (available after conversion)

## 💡 Tips & Best Practices

### Efficient Commenting
- Use consistent comment styles for different purposes
- Keep comments concise but descriptive
- Use the list view for final review passes
- Leverage search to find specific comment types

### Print Mode Tips
- Preview before exporting to check callout formatting
- Use meaningful callout types for different comment categories
- Remember to restore content after PDF generation
- Great for version control - export PDFs with feedback, keep original clean

### Organization Strategies
- Use header-based organization (outliner view) for structured documents
- Use list view for chronological comment review
- Convert high-priority comments to permanent callouts
- Use search to filter by comment type or keyword

### Collaboration Workflows
1. **Review Phase**: Add comments using standard prefix
2. **Discussion Phase**: Use Print Mode to share with team
3. **Resolution Phase**: Convert resolved comments to callouts or delete
4. **Final Phase**: Clean document with only essential permanent callouts

## 🚧 Development

### Building the Plugin
```bash
npm install          # Install dependencies
npm run dev         # Development mode with watch
npm run build       # Production build
```

### File Structure
```
obsidian-comments-manager/
├── main.ts              # Main plugin code with dual view system
├── styles.css           # Plugin styling for both view modes
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies and scripts
├── esbuild.config.mjs   # Build configuration
└── README.md           # This file
```

### Key Features in Code
- **Dual View System**: Toggle between outliner and list rendering
- **Lucide Icons**: Professional icon system throughout
- **State Management**: Preserves user preferences and expansions
- **Search Integration**: Real-time filtering for both view modes
- **Print Mode**: Temporary document conversion system

## 🤝 Contributing

We welcome contributions! Here's how to help:

1. **Fork the Repository**: Create your own copy
2. **Create Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Make Changes**: Add your improvements
4. **Test Thoroughly**: Ensure both view modes work properly
5. **Commit Changes**: `git commit -m 'Add amazing feature'`
6. **Push Branch**: `git push origin feature/amazing-feature`
7. **Open Pull Request**: Submit for review

### Contribution Ideas
- New view modes or visualization options
- Enhanced search capabilities
- Additional export formats
- Comment templates and snippets
- Integration with other plugins
- Performance optimizations

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Support

If you find this plugin helpful:

- ⭐ **Star the repository** to show your support
- 🐛 **Report bugs** in the Issues section
- 💡 **Request features** or suggest improvements
- 🔄 **Share with others** who might benefit
- ☕ **Buy me a coffee** if you'd like to support development

## 📞 Getting Help

- **Issues**: Report bugs or request features in GitHub Issues
- **Discussions**: Join community discussions for tips and workflows
- **Documentation**: Check this README for comprehensive guidance
- **Debug Mode**: Enable in settings for troubleshooting information

## 🎉 Changelog

### Version 1.3.0 (Latest)
- **🆕 Dual View System**: Toggle between outliner and list views
- **🎨 Lucide Icons**: Professional icon system throughout interface
- **💾 View Preferences**: Saved view mode selection
- **🔍 Enhanced Search**: Improved filtering for both view modes
- **📱 Better Mobile**: Improved responsive design
- **🐛 Bug Fixes**: Various stability improvements

### Version 1.2.0
- **🖨️ Print Mode**: Convert comments to callouts for PDF export
- **📝 Individual Conversion**: Convert specific comments to permanent callouts
- **🎨 Enhanced UI**: Professional styling and modal interfaces
- **⚙️ Print Settings**: Configurable callout types and options
- **🔧 Improved Reliability**: Better view detection and error handling

### Version 1.1.0
- **📝 Multi-line Comments**: Support for comments spanning multiple lines
- **🔄 Enhanced Parsing**: Improved comment detection and handling

### Version 1.0.0
- **🚀 Initial Release**: Core comment management functionality
- **📋 Side Panel**: Hierarchical comment organization
- **🔍 Search**: Real-time comment filtering
- **✏️ Editing**: In-panel and in-document editing
- **⚙️ Settings**: Customizable configuration options

---

**Made with ❤️ for the Obsidian community**