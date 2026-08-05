import { useRef, useState, type ChangeEvent } from "react";
import type { Editor } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { RichTextDocument } from "../shared/contracts";
import { uploadActionImage } from "./api";
import { CollapsibleHeading } from "./CollapsibleHeading";

type RichNoteEditorProps = {
  actionId: string;
  note: RichTextDocument;
  onChange: (note: RichTextDocument) => void;
};

export default function RichNoteEditor({ actionId, note, onChange }: RichNoteEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const editorReference = useRef<Editor | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function addImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    setUploadError(null);
    try {
      const attachment = await uploadActionImage(actionId, file);
      editorReference.current
        ?.chain()
        .focus()
        .setImage({ src: attachment.src, alt: attachment.alt, title: attachment.alt })
        .run();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The image could not be added.");
    } finally {
      setUploading(false);
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        link: { openOnClick: false },
      }),
      CollapsibleHeading.configure({ levels: [1, 2] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({
        allowBase64: false,
        resize: { enabled: true, minWidth: 120, minHeight: 80 },
      }),
      Placeholder.configure({
        placeholder: "Write notes…",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: note,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: "rich-note-content",
        "aria-label": "Action notes",
      },
      handlePaste: (_view, event) => {
        const image = Array.from(event.clipboardData?.files ?? [])
          .find((file) => file.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        void addImage(image);
        return true;
      },
      handleDrop: (_view, event) => {
        const image = Array.from(event.dataTransfer?.files ?? [])
          .find((file) => file.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        void addImage(image);
        return true;
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(updatedEditor.getJSON() as RichTextDocument);
    },
  }, [actionId]);
  editorReference.current = editor;

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current || current.isDestroyed) return EMPTY_TOOLBAR_STATE;
      return {
        h1: current.isActive("heading", { level: 1 }),
        h2: current.isActive("heading", { level: 2 }),
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        bullet: current.isActive("bulletList"),
        ordered: current.isActive("orderedList"),
        task: current.isActive("taskList"),
        quote: current.isActive("blockquote"),
      };
    },
  });

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void addImage(file);
  }

  return (
    <section className="rich-note" aria-label="Notes editor">
      <div className="rich-note-toolbar" role="toolbar" aria-label="Note formatting">
        <ToolbarButton label="H1" title="Heading 1" active={state?.h1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton label="H2" title="Heading 2" active={state?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
        <span className="toolbar-divider" aria-hidden="true" />
        <ToolbarButton label="B" title="Bold" active={state?.bold} strong onClick={() => editor?.chain().focus().toggleBold().run()} />
        <ToolbarButton label="I" title="Italic" active={state?.italic} italic onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="U" title="Underline" active={state?.underline} underline onClick={() => editor?.chain().focus().toggleUnderline().run()} />
        <span className="toolbar-divider" aria-hidden="true" />
        <ToolbarButton label="•" title="Bullet list" active={state?.bullet} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="1." title="Numbered list" active={state?.ordered} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="☐" title="Checklist" active={state?.task} onClick={() => editor?.chain().focus().toggleTaskList().run()} />
        <ToolbarButton label="❝" title="Quote" active={state?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
        <span className="toolbar-divider" aria-hidden="true" />
        <ToolbarButton
          label={uploading ? "…" : "Image"}
          title="Add image"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        />
        <span className="toolbar-spacer" />
        <ToolbarButton label="↶" title="Undo" onClick={() => editor?.chain().focus().undo().run()} />
        <ToolbarButton label="↷" title="Redo" onClick={() => editor?.chain().focus().redo().run()} />
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={chooseImage}
          tabIndex={-1}
        />
      </div>
      <EditorContent editor={editor} className="rich-note-editor" />
      {uploadError && <div className="rich-note-error" role="status">{uploadError}</div>}
    </section>
  );
}

const EMPTY_TOOLBAR_STATE = {
  h1: false,
  h2: false,
  bold: false,
  italic: false,
  underline: false,
  bullet: false,
  ordered: false,
  task: false,
  quote: false,
};

function ToolbarButton({
  label,
  title,
  active = false,
  disabled = false,
  strong = false,
  italic = false,
  underline = false,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  strong?: boolean;
  italic?: boolean;
  underline?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${active ? "is-active" : ""} ${strong ? "is-strong" : ""} ${italic ? "is-italic" : ""} ${underline ? "is-underlined" : ""}`}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
