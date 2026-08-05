# Writing surface

The Action Page is the first consumer of Organization's shared writing surface. Journal will reuse the same editor and document contract rather than introducing a second editing system.

## Editing model

The editor currently supports:

- collapsible H1 and H2 sections;
- bold, italic, and underline;
- bullet and numbered lists;
- interactive checked and unchecked task lists;
- block quotes and inline code;
- undo and redo;
- image selection, paste, and drop.

Tiptap provides the headless editing engine and keyboard behavior. The editor is loaded only when an Action Page opens, so it does not increase the initial calendar bundle. All styling and interface controls belong to Organization.

Heading collapse follows document hierarchy. An H1 owns everything until the next H1. An H2 owns everything until the next H2 or H1. The disclosure state is stored in the document with the heading.

## Persistence

Notes are stored as structured JSON documents in SQLite. They are not HTML strings and are never stored in browser storage. A 250 ms save queue combines fast successive editor transactions without interrupting typing.

Images use a two-part model:

1. SQLite records the attachment ID, action owner, filename, content type, size, and storage key.
2. The image bytes live under the ignored runtime upload directory.

Upload and read routes resolve the current owner on the server. JPEG, PNG, WebP, and GIF images are accepted up to 10 MB; SVG is deliberately excluded. Removing an image from the note removes its attachment record and bytes. Deleting the action removes every attachment belonging to it.

## Shared contract

The editor accepts a `RichTextDocument` and emits the same type. It has no Action-specific database logic; the Action Page supplies the document and save callback. Journal can therefore reuse the component while persisting documents through its own future repository.

## Deliberately deferred

Tables, embeds, file attachments, mentions, real-time collaboration, comments, and document history are not part of this writing foundation. They should be added only when a real workflow requires them.
