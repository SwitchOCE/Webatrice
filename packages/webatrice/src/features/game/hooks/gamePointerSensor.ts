import type { Activators, SensorInstance, SensorProps } from '@dnd-kit/core';

/** A viewport point. */
export interface Coordinates {
  x: number;
  y: number;
}

/**
 * The game's one pointer sensor for card drags.
 *
 * dnd-kit's PointerSensor takes one activation distance for the whole
 * DndContext and measures it as a straight line. The game has two gestures
 * with different, deliberately kept thresholds (see
 * .github/instructions/webatrice-game.instructions.md#pointer--click-vs-drag):
 *
 * - structured leaves start a drag on any motion (distance 0);
 * - seat cards and piles wait until the pointer leaves a four-pixel box around
 *   the press point (per axis, as PlayerBox always measured it), and a release
 *   inside the box is a click, delivered through `onRelease`.
 *
 * A draggable picks its gesture through its data (`PointerGestureData`). The
 * sensor listens on the window, so a release anywhere ends the gesture, and
 * removes every listener when it does.
 */
export interface GamePointerSensorOptions {
  /** Activation distance for draggables whose data doesn't set one. */
  activationDistance: number;
}

/** Optional fields a draggable's data may carry to tune its gesture. */
export interface PointerGestureData {
  /** Pixels the pointer must move along either axis before the drag starts.
   *  Set by seat sources; leaves without it use the sensor's default. */
  activationDistance?: number;
  /** Called when the pointer is released before the drag started. */
  onRelease?: (event: PointerEvent) => void;
}

function gestureData(props: SensorProps<GamePointerSensorOptions>): PointerGestureData | undefined {
  return props.activeNode.data.current as PointerGestureData | undefined;
}

function coordinatesOf(event: PointerEvent): Coordinates {
  return { x: event.clientX, y: event.clientY };
}

export class GamePointerSensor implements SensorInstance {
  static activators: Activators<GamePointerSensorOptions> = [
    {
      eventName: 'onPointerDown',
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }, _options, { active }) => {
        if (nativeEvent.button !== 0) {
          return false;
        }
        // Structured leaves keep dnd-kit's primary-pointer rule; seat sources
        // never had it.
        const seat = (active.data.current as PointerGestureData | undefined)?.activationDistance != null;
        return seat || nativeEvent.isPrimary;
      },
    },
  ];

  autoScrollEnabled: boolean;

  private activated = false;
  private readonly initial: Coordinates;
  private readonly distance: number;
  private readonly window: Window;

  constructor(private readonly props: SensorProps<GamePointerSensorOptions>) {
    const event = props.event as PointerEvent;
    const data = gestureData(props);
    this.initial = coordinatesOf(event);
    this.distance = data?.activationDistance ?? props.options.activationDistance;
    // Seat drags never auto-scrolled the zone they started in.
    this.autoScrollEnabled = data?.activationDistance == null;
    this.window = (event.target as Node | null)?.ownerDocument?.defaultView ?? window;
    this.window.addEventListener('pointermove', this.handleMove);
    this.window.addEventListener('pointerup', this.handleEnd);
    this.window.addEventListener('pointercancel', this.handleCancel);
    this.window.addEventListener('keydown', this.handleKeydown);
    this.window.addEventListener('resize', this.handleCancel);
    this.window.addEventListener('dragstart', preventDefault);
  }

  private detach() {
    this.window.removeEventListener('pointermove', this.handleMove);
    this.window.removeEventListener('pointerup', this.handleEnd);
    this.window.removeEventListener('pointercancel', this.handleCancel);
    this.window.removeEventListener('keydown', this.handleKeydown);
    this.window.removeEventListener('resize', this.handleCancel);
    this.window.removeEventListener('dragstart', preventDefault);
  }

  private handleMove = (event: PointerEvent) => {
    const coordinates = coordinatesOf(event);
    if (!this.activated) {
      const dx = Math.abs(coordinates.x - this.initial.x);
      const dy = Math.abs(coordinates.y - this.initial.y);
      if (dx <= this.distance && dy <= this.distance) {
        return;
      }
      this.activated = true;
      this.props.onStart(this.initial);
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    this.props.onMove(coordinates);
  };

  private handleEnd = (event: PointerEvent) => {
    this.detach();
    if (!this.activated) {
      this.props.onAbort(this.props.active);
      gestureData(this.props)?.onRelease?.(event);
    }
    this.props.onEnd();
  };

  private handleCancel = () => {
    this.detach();
    if (!this.activated) {
      this.props.onAbort(this.props.active);
    }
    this.props.onCancel();
  };

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.handleCancel();
    }
  };
}

function preventDefault(event: Event) {
  event.preventDefault();
}
