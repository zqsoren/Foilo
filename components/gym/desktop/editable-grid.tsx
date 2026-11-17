"use client";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  defaultDropAnimationSideEffects,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { widgets, type Widget } from "@/lib/gym/desktop";
import { moveWidget, widgetSpan } from "@/lib/gym/desktop-layout";

const ease = "cubic-bezier(0.23, 1, 0.32, 1)";
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};
// Native grid packing determines destinations, including two-column phase cards.
// The measured FLIP below animates every displaced card, including cards whose
// array index stays the same when a two-column card changes grid packing.
const packingStrategy = () => null;

function SortableWidget({
  kind,
  columns,
  scale,
  width,
  editing,
  editable,
  busy,
  fresh,
  removing,
  children,
  remove,
}: {
  kind: Widget;
  columns: number;
  scale: number;
  width: number;
  editing: boolean;
  editable: boolean;
  busy: boolean;
  fresh: boolean;
  removing: boolean;
  children: ReactNode;
  remove: () => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: kind,
    disabled: !editable,
    transition: null,
    animateLayoutChanges: () => false,
  });
  const [, w, h] = widgets[kind],
    span = widgetSpan(kind, columns);
  const localScale = w > 600 && columns === 1 ? Math.min(1, width / w) : scale;
  return (
    <div
      ref={setNodeRef}
      data-widget={kind}
      className={`gx-slot${fresh ? " gx-fresh" : ""}${removing ? " gx-removing" : ""}${isDragging ? " gx-drag-source" : ""}`}
      style={
        {
          gridColumn: `span ${span.columns}`,
          gridRow: columns === 1 ? undefined : `span ${span.rows}`,
          height: columns === 1 ? h * localScale : undefined,
          transform: CSS.Translate.toString(transform),
          transition,
        } as CSSProperties
      }
    >
      <div
        inert={editing}
        className="gx-scaled"
        style={{ transform: `scale(${localScale})` }}
      >
        {children}
      </div>
      {editable && (
        <button
          className="gx-drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`移动${widgets[kind][0]}`}
          aria-roledescription="可拖动小组件"
        />
      )}
      {editing && (
        <button
          className="gx-remove"
          disabled={busy}
          aria-label={`移除${widgets[kind][0]}`}
          onClick={remove}
        >
          <X size={14} />
        </button>
      )}
      {isDragging && (
        <span
          className="gx-drop-placeholder"
          style={{ width: w * localScale, height: h * localScale }}
        />
      )}
    </div>
  );
}

function DragPreview({
  node,
  width,
  height,
}: {
  node: HTMLElement;
  width: number;
  height: number;
}) {
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      // Clone our already-rendered, inert widget so dates and local controls retain
      // their exact appearance during a drag. No external HTML is injected.
      element?.replaceChildren(node);
    },
    [node],
  );
  return (
    <div
      ref={attach}
      className="gx-drag-preview"
      style={{ width, height }}
      aria-hidden
      inert
    />
  );
}

export function EditableGrid({
  layout,
  columns,
  scale,
  canvasWidth,
  editing,
  editable,
  busy,
  fresh,
  removing,
  face,
  change,
  remove,
  empty,
}: {
  layout: Widget[];
  columns: number;
  scale: number;
  canvasWidth: number;
  editing: boolean;
  editable: boolean;
  busy: boolean;
  fresh: Widget | null;
  removing: Widget | null;
  face: (kind: Widget) => ReactNode;
  change: (next: Widget[]) => void;
  remove: (kind: Widget) => void;
  empty: () => void;
}) {
  const ref = useRef<HTMLElement>(null),
    start = useRef<Widget[]>([]);
  const activeDrag = useRef<Widget | null>(null),
    keyboardDrag = useRef(false);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const animations = useRef(new Map<HTMLElement, Animation>());
  function changeOrder(next: Widget[]) {
    if (next === layout) return;
    before.current = new Map(
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>("[data-widget]") ?? [],
        (node) => [node.dataset.widget!, node.getBoundingClientRect()],
      ),
    );
    change(next);
  }
  useLayoutEffect(() => {
    const prior = before.current;
    if (!prior) return;
    before.current = null;
    const nodes = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("[data-widget]") ?? [],
    );
    nodes.forEach((node) => animations.current.get(node)?.cancel());
    const positions = nodes.map((node) => ({
      node,
      rect: node.getBoundingClientRect(),
    }));
    for (const { node, rect } of positions) {
      const old = prior.get(node.dataset.widget!);
      if (!old || node.classList.contains("gx-drag-source")) continue;
      const x = old.left - rect.left,
        y = old.top - rect.top;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      const animation = node.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: 260, easing: ease },
      );
      animations.current.set(node, animation);
      void animation.finished
        .then(() => {
          if (animations.current.get(node) === animation)
            animations.current.delete(node);
        })
        .catch(() => {});
    }
  }, [layout]);
  const [preview, setPreview] = useState<{
    node: HTMLElement;
    width: number;
    height: number;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <DndContext
      id="gym-widget-layout"
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        screenReaderInstructions: {
          draggable: "按空格拿起组件，方向键移动，空格放下，Esc取消本次拖动。",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `已拿起${widgets[active.id as Widget][0]}`,
          onDragOver: ({ active, over }) =>
            over
              ? `${widgets[active.id as Widget][0]}移到${widgets[over.id as Widget][0]}的位置`
              : undefined,
          onDragEnd: () => "已放下组件，退出编辑时保存新顺序",
          onDragCancel: () => "已取消本次拖动",
        },
      }}
      onDragStart={({ active, activatorEvent }) => {
        start.current = [...layout];
        activeDrag.current = active.id as Widget;
        keyboardDrag.current = activatorEvent.type === "keydown";
        const source = ref.current?.querySelector<HTMLElement>(
          `[data-widget="${active.id}"] .gx-scaled`,
        );
        const card = source?.querySelector<HTMLElement>(".gx-widget");
        if (source && card) {
          const box = card.getBoundingClientRect();
          setPreview({
            node: source.cloneNode(true) as HTMLElement,
            width: box.width,
            height: box.height,
          });
        }
      }}
      onDragOver={({ active, over }) => {
        if (
          activeDrag.current === active.id &&
          !keyboardDrag.current &&
          over &&
          active.id !== over.id
        )
          changeOrder(
            moveWidget(layout, active.id as Widget, over.id as Widget),
          );
      }}
      onDragEnd={({ active, over }) => {
        activeDrag.current = null;
        if (keyboardDrag.current && over)
          changeOrder(
            moveWidget(layout, active.id as Widget, over.id as Widget),
          );
        else if (!over) changeOrder(start.current);
        setPreview(null);
      }}
      onDragCancel={() => {
        activeDrag.current = null;
        changeOrder(start.current);
        setPreview(null);
      }}
    >
      <SortableContext items={layout} strategy={packingStrategy}>
        <section
          ref={ref}
          className="gx-grid"
          aria-label="健身数据概览"
          style={{
            width: canvasWidth * scale,
            maxWidth: "100%",
            marginInline: "auto",
            gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
            gridAutoRows: columns === 1 ? "auto" : 200 * scale,
            columnGap: 15 * scale,
            rowGap: 20 * scale,
          }}
        >
          {layout.map((kind) => (
            <SortableWidget
              key={kind}
              kind={kind}
              columns={columns}
              scale={scale}
              width={canvasWidth * scale}
              editing={editing}
              editable={editable}
              busy={busy || !!removing}
              fresh={fresh === kind}
              removing={removing === kind}
              remove={() => remove(kind)}
            >
              {face(kind)}
            </SortableWidget>
          ))}
          {!layout.length && (
            <button className="gx-add-empty" onClick={empty}>
              ＋ 添加小组件
            </button>
          )}
        </section>
      </SortableContext>
      <DragOverlay
        adjustScale={false}
        zIndex={30}
        dropAnimation={{
          duration: 260,
          easing: ease,
          sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: "0" } },
          }),
        }}
      >
        {preview && <DragPreview {...preview} />}
      </DragOverlay>
    </DndContext>
  );
}
