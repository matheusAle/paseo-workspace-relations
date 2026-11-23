import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Dimensions, Platform, Pressable, View, type ViewStyle } from "react-native";
import type { Palette } from "./look";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measure(view: View | null): Promise<Rect | null> {
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

const PORTAL_TYPE = Symbol.for("react.portal");
let portalHost: unknown = null;

/**
 * Renders into a container on document.body. The sidebar sits in a transformed, overflow-hidden
 * ancestor, which clips even fixed-position children, so the hover card has to leave the tree the
 * way the app's own popovers do. Plugins can't import react-dom, but a portal is a plain element
 * tagged with the global react.portal symbol, which the host renderer mounts like createPortal's.
 */
function webPortal(children: ReactNode): ReactNode {
  const doc = (globalThis as unknown as {
    document?: { createElement(tag: string): { setAttribute(name: string, value: string): void }; body: { appendChild(node: unknown): void } };
  }).document;
  if (Platform.OS !== "web" || !doc) return children;
  if (!portalHost) {
    const host = doc.createElement("div");
    host.setAttribute("data-workspace-relations", "overlay");
    doc.body.appendChild(host);
    portalHost = host;
  }
  return { $$typeof: PORTAL_TYPE, key: null, children, containerInfo: portalHost, implementation: null } as unknown as ReactNode;
}

type MenuState =
  | {
      kind: "anchor";
      anchorTop: number;
      anchorBottom: number;
      rootHeight: number;
      left: number;
      width: number;
      render: (close: () => void) => ReactNode;
    }
  | {
      /** A right-click menu at the cursor, in window coordinates, free to overflow the sidebar. */
      kind: "point";
      x: number;
      y: number;
      width: number;
      render: (close: () => void) => ReactNode;
    };

type MenuTarget = { anchor: View | null } | { point: { x: number; y: number } };

type MenuInput = MenuTarget & {
  width: number;
  render: (close: () => void) => ReactNode;
  /** Called once when this menu closes, however it closes. */
  onClose?: () => void;
};

interface CardState {
  key: string;
  anchor: Rect;
  left: number;
  render: () => ReactNode;
}

interface LayerApi {
  openMenu(input: MenuInput): void;
  closeMenu(): void;
  showCard(input: { key: string; anchor: View | null; render: () => ReactNode }): void;
  hideCard(key: string): void;
  /** Hides whichever card is showing, at once. */
  dismissCard(): void;
  openDialog(render: (close: () => void) => ReactNode): void;
}

/**
 * Props that open a menu on right-click, for a plain View. React Native's types don't list
 * onContextMenu; react-native-web forwards it to the DOM. Native rows keep their kebab instead.
 */
export function contextMenuProps(open: (point: { x: number; y: number }) => void): object {
  if (Platform.OS !== "web") return {};
  return {
    onContextMenu: (event: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }) => {
      event.preventDefault();
      event.stopPropagation();
      open({ x: event.clientX, y: event.clientY });
    },
  };
}

const LayerContext = createContext<LayerApi | null>(null);

export function useLayer(): LayerApi {
  const value = useContext(LayerContext);
  if (!value) throw new Error("useLayer must be used inside LayerHost");
  return value;
}

const CARD_WIDTH = 260;
const CARD_HIDE_DELAY_MS = 100;

/**
 * Hosts the sidebar's floating UI. Menus are absolutely positioned inside the view; the hover card
 * sits beside the sidebar like the app's, portaled out of it on web — the only place hover exists.
 */
export function LayerHost({
  rootRef,
  palette,
  children,
}: {
  rootRef: RefObject<View | null>;
  palette: Palette;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const [menuHeight, setMenuHeight] = useState<number | null>(null);
  const [dialog, setDialog] = useState<((close: () => void) => ReactNode) | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardKey = useRef<string | null>(null);

  const menuOnClose = useRef<(() => void) | null>(null);

  const closeMenu = useCallback(() => {
    const onClose = menuOnClose.current;
    menuOnClose.current = null;
    setMenu(null);
    onClose?.();
  }, []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const api = useMemo<LayerApi>(
    () => ({
      openMenu(input) {
        const { width, render, onClose } = input;
        setCard(null);
        menuOnClose.current?.();
        menuOnClose.current = onClose ?? null;
        setMenuHeight(null);
        if ("point" in input) {
          setMenu({ kind: "point", x: input.point.x, y: input.point.y, width, render });
          return;
        }
        void Promise.all([measure(rootRef.current), measure(input.anchor)]).then(([root, target]) => {
          if (!root || !target) {
            closeMenu();
            return;
          }
          const left = Math.min(
            Math.max(8, target.x - root.x + target.width - width),
            Math.max(8, root.width - width - 8),
          );
          setMenu({
            kind: "anchor",
            anchorTop: target.y - root.y,
            anchorBottom: target.y - root.y + target.height,
            rootHeight: root.height,
            left,
            width,
            render,
          });
        });
      },
      closeMenu,
      showCard({ key, anchor, render }) {
        if (Platform.OS !== "web") return;
        cancelHide();
        void Promise.all([measure(rootRef.current), measure(anchor)]).then(([root, target]) => {
          if (!root || !target) return;
          if (cardKey.current !== key) setCardHeight(null);
          cardKey.current = key;
          setCard({ key, anchor: target, left: root.x + root.width + 4, render });
        });
      },
      hideCard(key) {
        cancelHide();
        hideTimer.current = setTimeout(() => {
          if (cardKey.current !== key) return;
          cardKey.current = null;
          setCard(null);
        }, CARD_HIDE_DELAY_MS);
      },
      dismissCard() {
        cancelHide();
        cardKey.current = null;
        setCard(null);
      },
      openDialog(render) {
        closeMenu();
        setDialog(() => render);
      },
    }),
    [rootRef, closeMenu, cancelHide],
  );

  const menuOpen = menu !== null;
  useEffect(() => {
    const doc = (globalThis as unknown as {
      document?: {
        addEventListener(type: "keydown", listener: (event: { key: string }) => void): void;
        removeEventListener(type: "keydown", listener: (event: { key: string }) => void): void;
      };
    }).document;
    if (!menuOpen || Platform.OS !== "web" || !doc) return;
    const onKeyDown = (event: { key: string }) => {
      if (event.key === "Escape") closeMenu();
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, closeMenu]);

  const menuChrome: ViewStyle = {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: 8,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  };

  let pointMenu: ReactNode = null;
  if (menu?.kind === "point") {
    const viewport = Dimensions.get("window");
    const height = menuHeight ?? 0;
    // A right-click on the backdrop closes the menu instead of opening the browser's.
    const closeOnContextMenu = {
      onContextMenu: (event: { preventDefault(): void }) => {
        event.preventDefault();
        closeMenu();
      },
    } as object;
    pointMenu = webPortal(
      <View style={{ position: "fixed" as ViewStyle["position"], top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100 }}>
        <Pressable
          accessibilityLabel="Close menu"
          onPress={closeMenu}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          {...closeOnContextMenu}
        />
        <View
          // The items are menuitems; without a menu around them, page-wide stylers (Chat Polish)
          // look further up for the surface and restyle the whole sidebar.
          accessibilityRole="menu"
          onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
          style={{
            ...menuChrome,
            position: "absolute",
            // At the cursor, shifted back inside the window where it would run past an edge.
            left: Math.max(8, Math.min(menu.x, viewport.width - menu.width - 8)),
            top: menu.y + height > viewport.height - 8 ? Math.max(8, menu.y - height) : menu.y,
            width: menu.width,
          }}
        >
          {menu.render(closeMenu)}
        </View>
      </View>,
    );
  }

  let cardStyle: ViewStyle | null = null;
  if (card) {
    const windowHeight = Dimensions.get("window").height;
    const height = cardHeight ?? 0;
    const centered = card.anchor.y + card.anchor.height / 2 - height / 2;
    cardStyle = {
      // RN types don't list "fixed"; react-native-web passes it through. Window coordinates.
      position: "fixed" as ViewStyle["position"],
      left: card.left,
      top: Math.max(8, Math.min(centered, windowHeight - height - 8)),
      width: CARD_WIDTH,
      opacity: cardHeight === null ? 0 : 1,
      zIndex: 1000,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.cardBorder,
      borderRadius: 8,
      paddingTop: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    };
  }

  return (
    <LayerContext.Provider value={api}>
      {children}
      {menu?.kind === "anchor" ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 900 }}>
          <Pressable
            accessibilityLabel="Close menu"
            onPress={closeMenu}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            accessibilityRole="menu"
            onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              ...menuChrome,
              position: "absolute",
              // Below the anchor, or above it when it would run past the sidebar's bottom edge.
              top:
                menuHeight !== null && menu.anchorBottom + 4 + menuHeight > menu.rootHeight - 8
                  ? Math.max(8, menu.anchorTop - menuHeight - 4)
                  : menu.anchorBottom + 4,
              left: menu.left,
              width: menu.width,
            }}
          >
            {menu.render(closeMenu)}
          </View>
        </View>
      ) : null}
      {pointMenu}
      {card && cardStyle
        ? webPortal(
            <View
              // A plain View: the card holds copy and checks buttons (docs/hover.md).
              onPointerEnter={cancelHide}
              onPointerLeave={() => api.hideCard(card.key)}
              onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
              style={cardStyle}
            >
              {card.render()}
            </View>,
          )
        : null}
      {dialog ? dialog(closeDialog) : null}
    </LayerContext.Provider>
  );
}
