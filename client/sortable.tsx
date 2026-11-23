import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PanResponder, Platform, View, type ViewStyle } from "react-native";
import { dropIndex, moveItem } from "../shared/order";

// The app's activation: a mouse drag starts after deliberate movement, a touch drag after a hold.
const MOUSE_DISTANCE = 6;
const TOUCH_HOLD_MS = 180;
const IS_WEB = Platform.OS === "web";

interface DragScope {
  readonly active: boolean;
  setActive(active: boolean): void;
}

/** One drag at a time across the sidebar: rows drop hover and the list stops scrolling while it runs. */
export const DragScopeContext = createContext<DragScope>({ active: false, setActive: () => {} });

export function useDragActive(): boolean {
  return useContext(DragScopeContext).active;
}

export interface SortableHandle {
  /** For the row's outer View: marks the row as the one the press started on. */
  readonly viewProps: object;
  /** For the row's Pressable: on touch, holding the row picks it up. */
  readonly pressProps: { delayLongPress?: number; onLongPress?: () => void; onPressOut?: () => void };
  readonly dragging: boolean;
}

const HandleContext = createContext<SortableHandle | null>(null);

/** The drag handle of the item this row heads, or null outside a sortable list. */
export function useSortableHandle(): SortableHandle | null {
  return useContext(HandleContext);
}

/** What an item's handle tells its list: the press started on it, or a touch hold picked it up. */
interface Grip {
  pressed(id: string): void;
  pickUp(id: string): void;
  liftEnded(): void;
}

/**
 * Releasing a mouse drag over the row it started on still clicks it, and react-native-web presses
 * a Pressable on click. Swallow that one click before it reaches the app.
 */
function swallowNextClick(): void {
  const doc = (globalThis as unknown as {
    document?: {
      addEventListener(type: "click", listener: (event: { stopPropagation(): void; preventDefault(): void }) => void, options: { capture: boolean; once: boolean }): void;
      removeEventListener(type: "click", listener: (event: { stopPropagation(): void; preventDefault(): void }) => void, options: { capture: boolean }): void;
    };
  }).document;
  if (!IS_WEB || !doc) return;
  const swallow = (event: { stopPropagation(): void; preventDefault(): void }) => {
    event.stopPropagation();
    event.preventDefault();
  };
  doc.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => doc.removeEventListener("click", swallow, { capture: true }), 300);
}

function SortableItem({
  id,
  enabled,
  grip,
  dragging,
  offset,
  animate,
  onLayout,
  nodeRef,
  children,
}: {
  id: string;
  enabled: boolean;
  grip: Grip;
  dragging: boolean;
  offset: number;
  animate: boolean;
  onLayout: (height: number) => void;
  nodeRef: (node: View | null) => void;
  children: ReactNode;
}) {
  const handle = useMemo<SortableHandle>(
    () => ({
      // Runs on every press start that lands on this row, before anything claims it; the list
      // starts the drag once the pointer moves.
      viewProps: {
        onStartShouldSetResponderCapture: () => {
          grip.pressed(id);
          return false;
        },
      },
      pressProps:
        IS_WEB || !enabled
          ? // Without a drag to start, leave the long press alone: it would swallow a slow tap.
            {}
          : {
              delayLongPress: TOUCH_HOLD_MS,
              onLongPress: () => grip.pickUp(id),
              onPressOut: () => grip.liftEnded(),
            },
      dragging,
    }),
    [grip, id, enabled, dragging],
  );

  let style: ViewStyle | null = null;
  if (dragging) {
    style = { transform: [{ translateY: offset }, { scale: 1.02 }], opacity: 0.9, zIndex: 1000 };
  } else if (offset !== 0) {
    style = { transform: [{ translateY: offset }] };
  }
  // react-native-web passes CSS transitions through; RN's style types don't list them.
  const slide = animate && !dragging && IS_WEB ? ({ transitionProperty: "transform", transitionDuration: "150ms" } as ViewStyle) : null;

  return (
    <HandleContext.Provider value={handle}>
      <View
        ref={nodeRef}
        onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
        style={[style, slide]}
      >
        {children}
      </View>
    </HandleContext.Provider>
  );
}

/**
 * A vertical list whose items can be dragged into a new order, like the app's sidebar lists. The
 * row heading each item spreads `useSortableHandle()` to become its drag handle. The new order
 * shows at once and `onReorder` persists it.
 */
export function SortableList({
  ids,
  enabled,
  onReorder,
  renderItem,
}: {
  ids: readonly string[];
  enabled: boolean;
  onReorder: (next: string[]) => void;
  renderItem: (id: string) => ReactNode;
}) {
  const scope = useContext(DragScopeContext);
  const joined = ids.join("\u0000");
  const [dropped, setDropped] = useState<string[] | null>(null);
  // The saved order arrives a moment after the drop; until then show the drop's order.
  useEffect(() => setDropped(null), [joined]);
  const order = dropped ?? ids;
  const heights = useRef(new Map<string, number>());
  const nodes = useRef(new Map<string, View | null>());
  /** The items' positions when the drag started, before anything moved. */
  const placed = useRef<{ y: number; height: number }[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);

  const live = useRef({ order, onReorder, scope });
  live.current = { order, onReorder, scope };
  /**
   * Where each item sits, measured when a drag starts. On web the DOM answers directly; onLayout
   * there misses moves and some resizes inside nested lists. Native items stack with no space
   * between them (row margins sit inside), so positions follow from their onLayout heights.
   */
  const measure = (keys: readonly string[]) => {
    if (IS_WEB) {
      const rects = keys.map((key) => (nodes.current.get(key) as unknown as { getBoundingClientRect?: () => { top: number; height: number } } | null)?.getBoundingClientRect?.());
      if (rects.every(Boolean)) return rects.map((rect) => ({ y: rect?.top ?? 0, height: rect?.height ?? 0 }));
    }
    let y = 0;
    return keys.map((key) => {
      const height = heights.current.get(key) ?? 0;
      const layout = { y, height };
      y += height;
      return layout;
    });
  };

  const start = (id: string) => {
    placed.current = measure(live.current.order);
    live.current.scope.setActive(true);
    setDrag({ id, dy: 0 });
  };
  const finish = (id: string, dy: number, commit: boolean) => {
    const layouts = placed.current;
    placed.current = null;
    setDrag(null);
    live.current.scope.setActive(false);
    if (!commit || !layouts) return;
    const current = live.current.order;
    const from = current.indexOf(id);
    if (from < 0) return;
    const to = dropIndex(layouts, from, dy);
    if (to === from) return;
    const next = moveItem(current, from, to);
    setDropped(next);
    live.current.onReorder(next);
  };
  const live2 = useRef({ start, finish, enabled });
  live2.current = { start, finish, enabled };

  /*
   * The list, not the row, takes the gesture over. react-native-web (like React Native) asks only
   * the views above both the pressed element and the one now under the pointer, so once a quick
   * move leaves the pressed row, the row's own views are never asked. The list holds every row.
   */
  const gesture = useRef<{ pressedId: string | null; armed: boolean; granted: boolean; startDy: number }>({
    pressedId: null,
    armed: false,
    granted: false,
    startDy: 0,
  });
  const grip = useMemo<Grip>(
    () => ({
      pressed(id) {
        gesture.current.pressedId = id;
      },
      pickUp(id) {
        if (!live2.current.enabled) return;
        gesture.current.pressedId = id;
        gesture.current.armed = true;
        live2.current.start(id);
      },
      liftEnded() {
        // The row's press also ends when the list takes the gesture over; only a lift without
        // moving puts the row back down.
        setTimeout(() => {
          const state = gesture.current;
          if (!state.armed || state.granted || !state.pressedId) return;
          state.armed = false;
          live2.current.finish(state.pressedId, 0, false);
        }, 0);
      },
    }),
    [],
  );
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Capture runs from the root down, so this resets before the pressed row records itself.
        onStartShouldSetPanResponderCapture: () => {
          gesture.current = { pressedId: null, armed: false, granted: false, startDy: 0 };
          return false;
        },
        onMoveShouldSetPanResponderCapture: (_event, state) => {
          const current = gesture.current;
          if (!live2.current.enabled || !current.pressedId) return false;
          const take = IS_WEB
            ? Math.abs(state.dy) > MOUSE_DISTANCE || Math.abs(state.dx) > MOUSE_DISTANCE
            : current.armed;
          // PanResponder measures dy from where it takes over, past the activation distance on
          // web; keep that distance so the row stays under the pointer.
          if (take) current.startDy = state.dy;
          return take;
        },
        onPanResponderGrant: () => {
          const current = gesture.current;
          current.granted = true;
          if (!current.armed && current.pressedId) live2.current.start(current.pressedId);
        },
        onPanResponderMove: (_event, state) => {
          const current = gesture.current;
          if (current.pressedId) setDrag({ id: current.pressedId, dy: current.startDy + state.dy });
        },
        onPanResponderRelease: (_event, state) => {
          const current = gesture.current;
          if (current.pressedId) live2.current.finish(current.pressedId, current.startDy + state.dy, true);
          gesture.current = { pressedId: null, armed: false, granted: false, startDy: 0 };
          swallowNextClick();
        },
        onPanResponderTerminate: () => {
          const current = gesture.current;
          if (current.pressedId) live2.current.finish(current.pressedId, 0, false);
          gesture.current = { pressedId: null, armed: false, granted: false, startDy: 0 };
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  let from = -1;
  let to = -1;
  let span = 0;
  if (drag && placed.current) {
    from = order.indexOf(drag.id);
    to = dropIndex(placed.current, from, drag.dy);
    span = placed.current[from]?.height ?? 0;
  }

  return (
    <View {...responder.panHandlers}>
      {order.map((id, index) => {
        let offset = 0;
        if (drag && index === from) offset = drag.dy;
        else if (drag && index > from && index <= to) offset = -span;
        else if (drag && index < from && index >= to) offset = span;
        return (
          <SortableItem
            key={id}
            id={id}
            enabled={enabled}
            grip={grip}
            dragging={drag?.id === id}
            offset={offset}
            animate={drag !== null}
            onLayout={(height) => heights.current.set(id, height)}
            nodeRef={(node) => {
              if (node) nodes.current.set(id, node);
              else nodes.current.delete(id);
            }}
          >
            {renderItem(id)}
          </SortableItem>
        );
      })}
    </View>
  );
}
