import { type NodeViewRenderer } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const collapsibleHeadingKey = new PluginKey("collapsible-heading-sections");

export const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) => ({
          "data-collapsed": attributes.collapsed ? "true" : "false",
        }),
      },
    };
  },

  addNodeView() {
    return collapsibleHeadingNodeView;
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: collapsibleHeadingKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            let collapsedLevel: number | null = null;

            state.doc.forEach((node, offset) => {
              const headingLevel = node.type.name === this.name
                ? Number(node.attrs.level)
                : null;

              if (
                collapsedLevel !== null &&
                headingLevel !== null &&
                headingLevel <= collapsedLevel
              ) {
                collapsedLevel = null;
              }

              if (collapsedLevel !== null) {
                decorations.push(Decoration.node(
                  offset,
                  offset + node.nodeSize,
                  { class: "is-collapsed-section-content" },
                ));
                return;
              }

              if (
                headingLevel !== null &&
                headingLevel <= 2 &&
                node.attrs.collapsed === true
              ) {
                collapsedLevel = headingLevel;
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const collapsibleHeadingNodeView: NodeViewRenderer = ({ node, getPos, view }) => {
  let currentNode = node;
  const level = Number(node.attrs.level);
  const dom = document.createElement(`h${level}`);
  const toggle = document.createElement("button");
  const content = document.createElement("span");

  dom.className = "collapsible-heading";
  toggle.className = "heading-collapse-button";
  toggle.type = "button";
  toggle.contentEditable = "false";
  content.className = "collapsible-heading-content";
  dom.append(toggle, content);

  const synchronize = () => {
    const collapsed = currentNode.attrs.collapsed === true;
    dom.dataset.collapsed = String(collapsed);
    toggle.textContent = collapsed ? "▸" : "▾";
    toggle.title = collapsed ? "Expand section" : "Collapse section";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(!collapsed));
  };

  const toggleSection = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const position = getPos();
    if (typeof position !== "number") return;
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, {
      ...currentNode.attrs,
      collapsed: currentNode.attrs.collapsed !== true,
    }));
    view.focus();
  };

  toggle.addEventListener("click", toggleSection);
  synchronize();

  return {
    dom,
    contentDOM: content,
    update: (updatedNode) => {
      if (
        updatedNode.type.name !== currentNode.type.name ||
        updatedNode.attrs.level !== currentNode.attrs.level
      ) {
        return false;
      }
      currentNode = updatedNode;
      synchronize();
      return true;
    },
    stopEvent: (event) => event.target === toggle,
    destroy: () => toggle.removeEventListener("click", toggleSection),
  };
};
