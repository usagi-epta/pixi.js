import { ExtensionType } from '../extensions/Extensions';
import { EventBoundary } from './EventBoundary';
import { EventsTicker } from './EventTicker';
import { FederatedPointerEvent } from './FederatedPointerEvent';
import { FederatedWheelEvent } from './FederatedWheelEvent';

import type { ExtensionMetadata } from '../extensions/Extensions';
import type { PointData } from '../maths/point/PointData';
import type { System } from '../rendering/renderers/shared/system/System';
import type { Renderer } from '../rendering/renderers/types';
import type { PixiTouch } from './FederatedEvent';
import type { EventMode } from './FederatedEventTarget';
import type { FederatedMouseEvent } from './FederatedMouseEvent';

const MOUSE_POINTER_ID = 1;
const TOUCH_TO_POINTER: Record<string, string> = {
    touchstart: 'pointerdown',
    touchend: 'pointerup',
    touchendoutside: 'pointerupoutside',
    touchmove: 'pointermove',
    touchcancel: 'pointercancel',
};

/** @ignore */
export interface EventSystemOptions
{
    /**
     * The default event mode mode for all display objects.
     * (included in the **pixi.js** and **pixi.js-legacy** bundle), otherwise it will be ignored.
     */
    eventMode?: EventMode;

    /**
     * The event features that are enabled by the EventSystem
     * (included in the **pixi.js** and **pixi.js-legacy** bundle), otherwise it will be ignored.
     * @example
     * const app = new Application({
     *   view: canvas,
     *   events: {
     *     move: true,
     *     globalMove: false,
     *     click: true,
     *     wheel: true,
     *   },
     * });
     */
    eventFeatures?: Partial<EventSystemFeatures>
}

/**
 * The event features that are enabled by the EventSystem
 * (included in the **pixi.js** and **pixi.js-legacy** bundle), otherwise it will be ignored.
 * @since 7.2.0
 * @category events
 */
export interface EventSystemFeatures
{
    /**
     * Enables pointer events associated with pointer movement:
     * - `pointermove` / `mousemove` / `touchmove`
     * - `pointerout` / `mouseout`
     * - `pointerover` / `mouseover`
     */
    move: boolean;
    // eslint-disable-next-line jsdoc/multiline-blocks
    /**
     * Enables global pointer move events:
     * - `globalpointermove`
     * - `globalmousemove`
     * - `globaltouchemove`
     */
    globalMove: boolean;
    /**
     * Enables pointer events associated with clicking:
     * - `pointerup` / `mouseup` / `touchend` / 'rightup'
     * - `pointerupoutside` / `mouseupoutside` / `touchendoutside` / 'rightupoutside'
     * - `pointerdown` / 'mousedown' / `touchstart` / 'rightdown'
     * - `click` / `tap`
     */
    click: boolean;
    /** - Enables wheel events. */
    wheel: boolean;
}

/**
 * The system for handling UI events.
 * @category events
 */
export class EventSystem implements System<EventSystemOptions>
{
    /** @ignore */
    public static extension: ExtensionMetadata = {
        name: 'events',
        type: [
            ExtensionType.WebGLSystem,
            ExtensionType.CanvasSystem,
            ExtensionType.WebGPUSystem,
        ],
        priority: -1,
    };

    /**
     * The event features that are enabled by the EventSystem
     * (included in the **pixi.js** and **pixi.js-legacy** bundle), otherwise it will be ignored.
     * @since 7.2.0
     */
    public static defaultEventFeatures: EventSystemFeatures = {
        /** Enables pointer events associated with pointer movement. */
        move: true,
        /** Enables global pointer move events. */
        globalMove: true,
        /** Enables pointer events associated with clicking. */
        click: true,
        /** Enables wheel events. */
        wheel: true,
    };

    private static _defaultEventMode: EventMode;

    /**
     * The default interaction mode for all display objects.
     * @see Container.eventMode
     * @type {EventMode}
     * @readonly
     * @since 7.2.0
     */
    public static get defaultEventMode()
    {
        return this._defaultEventMode;
    }

    /**
     * The {@link EventBoundary} for the stage.
     *
     * The {@link EventBoundary#rootTarget rootTarget} of this root boundary is automatically set to
     * the last rendered object before any event processing is initiated. This means the main scene
     * needs to be rendered atleast once before UI events will start propagating.
     *
     * The root boundary should only be changed during initialization. Otherwise, any state held by the
     * event boundary may be lost (like hovered & pressed Containers).
     */
    public readonly rootBoundary: EventBoundary;

    /** Does the device support touch events https://www.w3.org/TR/touch-events/ */
    public readonly supportsTouchEvents = 'ontouchstart' in globalThis;

    /** Does the device support pointer events https://www.w3.org/Submission/pointer-events/ */
    public readonly supportsPointerEvents = !!globalThis.PointerEvent;

    /**
     * Should default browser actions automatically be prevented.
     * Does not apply to pointer events for backwards compatibility
     * preventDefault on pointer events stops mouse events from firing
     * Thus, for every pointer event, there will always be either a mouse of touch event alongside it.
     * @default true
     */
    public autoPreventDefault: boolean;

    /**
     * Dictionary of how different cursor modes are handled. Strings are handled as CSS cursor
     * values, objects are handled as dictionaries of CSS values for `domElement`,
     * and functions are called instead of changing the CSS.
     * Default CSS cursor values are provided for 'default' and 'pointer' modes.
     */
    public cursorStyles: Record<string, string | ((mode: string) => void) | CSSStyleDeclaration>;

    /**
     * The DOM element to which the root event listeners are bound. This is automatically set to
     * the renderer's {@link Renderer#view view}.
     */
    public domElement: HTMLElement = null;

    /** The resolution used to convert between the DOM client space into world space. */
    public resolution = 1;

    /** The renderer managing this {@link EventSystem}. */
    public renderer: Renderer;

    /**
     * The event features that are enabled by the EventSystem
     * (included in the **pixi.js** and **pixi.js-legacy** bundle), otherwise it will be ignored.
     * @since 7.2.0
     * @example
     * const app = new Application()
     * app.renderer.events.features.globalMove = false
     *
     * // to override all features use Object.assign
     * Object.assign(app.renderer.events.features, {
     *  move: false,
     *  globalMove: false,
     *  click: false,
     *  wheel: false,
     * })
     */
    public readonly features: EventSystemFeatures;

    private _currentCursor: string;
    private readonly _rootPointerEvent: FederatedPointerEvent;
    private readonly _rootWheelEvent: FederatedWheelEvent;
    private _eventsAdded: boolean;

    /**
     * @param {Renderer} renderer
     */
    constructor(renderer: Renderer)
    {
        this.renderer = renderer;
        this.rootBoundary = new EventBoundary(null);
        EventsTicker.init(this);

        this.autoPreventDefault = true;
        this._eventsAdded = false;

        this._rootPointerEvent = new FederatedPointerEvent(null);
        this._rootWheelEvent = new FederatedWheelEvent(null);

        this.cursorStyles = {
            default: 'inherit',
            pointer: 'pointer',
        };

        this.features = new Proxy({ ...EventSystem.defaultEventFeatures }, {
            set: (target, key, value) =>
            {
                if (key === 'globalMove')
                {
                    this.rootBoundary.enableGlobalMoveEvents = value;
                }
                target[key as keyof EventSystemFeatures] = value;

                return true;
            }
        });

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onPointerOverOut = this._onPointerOverOut.bind(this);
        this.onWheel = this.onWheel.bind(this);
    }

    /**
     * Runner init called, view is available at this point.
     * @ignore
     */
    public init(options: EventSystemOptions): void
    {
        const { canvas, resolution } = this.renderer;

        this.setTargetElement(canvas as HTMLCanvasElement);
        this.resolution = resolution;
        EventSystem._defaultEventMode = options.eventMode ?? 'passive';
        Object.assign(this.features, options.eventFeatures ?? {});
        this.rootBoundary.enableGlobalMoveEvents = this.features.globalMove;
    }

    /**
     * Handle changing resolution.
     * @ignore
     */
    public resolutionChange(resolution: number): void
    {
        this.resolution = resolution;
    }

    /** Destroys all event listeners and detaches the renderer. */
    public destroy(): void
    {
        this.setTargetElement(null);
        this.renderer = null;
        this._currentCursor = null;
    }

    /**
     * Sets the current cursor mode, handling any callbacks or CSS style changes.
     * @param mode - cursor mode, a key from the cursorStyles dictionary
     */
    public setCursor(mode: string): void
    {
        mode ||= 'default';
        let applyStyles = true;

        // offscreen canvas does not support setting styles, but cursor modes can be functions,
        // in order to handle pixi rendered cursors, so we can't bail
        if (globalThis.OffscreenCanvas && this.domElement instanceof OffscreenCanvas)
        {
            applyStyles = false;
        }
        // if the mode didn't actually change, bail early
        if (this._currentCursor === mode)
        {
            return;
        }
        this._currentCursor = mode;
        const style = this.cursorStyles[mode];

        // only do things if there is a cursor style for it
        if (style)
        {
            switch (typeof style)
            {
                case 'string':
                    // string styles are handled as cursor CSS
                    if (applyStyles)
                    {
                        this.domElement.style.cursor = style;
                    }
                    break;
                case 'function':
                    // functions are just called, and passed the cursor mode
                    style(mode);
                    break;
                case 'object':
                    // if it is an object, assume that it is a dictionary of CSS styles,
                    // apply it to the interactionDOMElement
                    if (applyStyles)
                    {
                        Object.assign(this.domElement.style, style);
                    }
                    break;
            }
        }
        else if (applyStyles && typeof mode === 'string' && !Object.prototype.hasOwnProperty.call(this.cursorStyles, mode))
        {
            // if it mode is a string (not a Symbol) and cursorStyles doesn't have any entry
            // for the mode, then assume that the dev wants it to be CSS for the cursor.
            this.domElement.style.cursor = mode;
        }
    }

    /**
     * The global pointer event.
     * Useful for getting the pointer position without listening to events.
     * @since 7.2.0
     */
    public get pointer(): Readonly<FederatedPointerEvent>
    {
        return this._rootPointerEvent;
    }

    /**
     * Event handler for pointer down events on {@link EventSystem#domElement this.domElement}.
     * @param nativeEvent - The native mouse/pointer/touch event.
     */
    private _onPointerDown(nativeEvent: MouseEvent | PointerEvent | TouchEvent): void
    {
        if (!this.features.click) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;

        const events = this._normalizeToPointerData(nativeEvent);

        /*
         * No need to prevent default on natural pointer events, as there are no side effects
         * Normalized events, however, may have the double mousedown/touchstart issue on the native android browser,
         * so still need to be prevented.
         */

        // Guaranteed that there will be at least one event in events, and all events must have the same pointer type

        if (this.autoPreventDefault && (events[0] as any).isNormalized)
        {
            const cancelable = nativeEvent.cancelable || !('cancelable' in nativeEvent);

            if (cancelable)
            {
                nativeEvent.preventDefault();
            }
        }

        for (let i = 0, j = events.length; i < j; i++)
        {
            const nativeEvent = events[i];
            const federatedEvent = this._bootstrapEvent(this._rootPointerEvent, nativeEvent);

            this.rootBoundary.mapEvent(federatedEvent);
        }

        this.setCursor(this.rootBoundary.cursor);
    }

    /**
     * Event handler for pointer move events on on {@link EventSystem#domElement this.domElement}.
     * @param nativeEvent - The native mouse/pointer/touch events.
     */
    private _onPointerMove(nativeEvent: MouseEvent | PointerEvent | TouchEvent): void
    {
        if (!this.features.move) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;

        EventsTicker.pointerMoved();

        const normalizedEvents = this._normalizeToPointerData(nativeEvent);

        for (let i = 0, j = normalizedEvents.length; i < j; i++)
        {
            const event = this._bootstrapEvent(this._rootPointerEvent, normalizedEvents[i]);

            this.rootBoundary.mapEvent(event);
        }

        this.setCursor(this.rootBoundary.cursor);
    }

    /**
     * Event handler for pointer up events on {@link EventSystem#domElement this.domElement}.
     * @param nativeEvent - The native mouse/pointer/touch event.
     */
    private _onPointerUp(nativeEvent: MouseEvent | PointerEvent | TouchEvent): void
    {
        if (!this.features.click) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;

        let target = nativeEvent.target;

        // if in shadow DOM use composedPath to access target
        if (nativeEvent.composedPath && nativeEvent.composedPath().length > 0)
        {
            target = nativeEvent.composedPath()[0];
        }

        const outside = target !== this.domElement ? 'outside' : '';
        const normalizedEvents = this._normalizeToPointerData(nativeEvent);

        for (let i = 0, j = normalizedEvents.length; i < j; i++)
        {
            const event = this._bootstrapEvent(this._rootPointerEvent, normalizedEvents[i]);

            event.type += outside;

            this.rootBoundary.mapEvent(event);
        }

        this.setCursor(this.rootBoundary.cursor);
    }

    /**
     * Event handler for pointer over & out events on {@link EventSystem#domElement this.domElement}.
     * @param nativeEvent - The native mouse/pointer/touch event.
     */
    private _onPointerOverOut(nativeEvent: MouseEvent | PointerEvent | TouchEvent): void
    {
        if (!this.features.click) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;

        const normalizedEvents = this._normalizeToPointerData(nativeEvent);

        for (let i = 0, j = normalizedEvents.length; i < j; i++)
        {
            const event = this._bootstrapEvent(this._rootPointerEvent, normalizedEvents[i]);

            this.rootBoundary.mapEvent(event);
        }

        this.setCursor(this.rootBoundary.cursor);
    }

    /**
     * Passive handler for `wheel` events on {@link EventSystem.domElement this.domElement}.
     * @param nativeEvent - The native wheel event.
     */
    protected onWheel(nativeEvent: WheelEvent): void
    {
        if (!this.features.wheel) return;
        const wheelEvent = this.normalizeWheelEvent(nativeEvent);

        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;
        this.rootBoundary.mapEvent(wheelEvent);
    }

    /**
     * Sets the {@link EventSystem#domElement domElement} and binds event listeners.
     *
     * To deregister the current DOM element without setting a new one, pass `null`.
     * @param element - The new DOM element.
     */
    public setTargetElement(element: HTMLElement): void
    {
        this._removeEvents();
        this.domElement = element;
        EventsTicker.domElement = element;
        this._addEvents();
    }

    /** Register event listeners on {@link Renderer#domElement this.domElement}. */
    private _addEvents(): void
    {
        if (this._eventsAdded || !this.domElement)
        {
            return;
        }

        EventsTicker.addTickerListener();

        const style = this.domElement.style as CrossCSSStyleDeclaration;

        if (style)
        {
            if ((globalThis.navigator as any).msPointerEnabled)
            {
                style.msContentZooming = 'none';
                style.msTouchAction = 'none';
            }
            else if (this.supportsPointerEvents)
            {
                style.touchAction = 'none';
            }
        }

        /*
         * These events are added first, so that if pointer events are normalized, they are fired
         * in the same order as non-normalized events. ie. pointer event 1st, mouse / touch 2nd
         */
        if (this.supportsPointerEvents)
        {
            globalThis.document.addEventListener('pointermove', this._onPointerMove, true);
            this.domElement.addEventListener('pointerdown', this._onPointerDown, true);
            // pointerout is fired in addition to pointerup (for touch events) and pointercancel
            // we already handle those, so for the purposes of what we do in onPointerOut, we only
            // care about the pointerleave event
            this.domElement.addEventListener('pointerleave', this._onPointerOverOut, true);
            this.domElement.addEventListener('pointerover', this._onPointerOverOut, true);
            // globalThis.addEventListener('pointercancel', this.onPointerCancel, true);
            globalThis.addEventListener('pointerup', this._onPointerUp, true);
        }
        else
        {
            globalThis.document.addEventListener('mousemove', this._onPointerMove, true);
            this.domElement.addEventListener('mousedown', this._onPointerDown, true);
            this.domElement.addEventListener('mouseout', this._onPointerOverOut, true);
            this.domElement.addEventListener('mouseover', this._onPointerOverOut, true);
            globalThis.addEventListener('mouseup', this._onPointerUp, true);

            if (this.supportsTouchEvents)
            {
                this.domElement.addEventListener('touchstart', this._onPointerDown, true);
                // this.domElement.addEventListener('touchcancel', this.onPointerCancel, true);
                this.domElement.addEventListener('touchend', this._onPointerUp, true);
                this.domElement.addEventListener('touchmove', this._onPointerMove, true);
            }
        }

        this.domElement.addEventListener('wheel', this.onWheel, {
            passive: true,
            capture: true,
        });

        this._eventsAdded = true;
    }

    /** Unregister event listeners on {@link EventSystem#domElement this.domElement}. */
    private _removeEvents(): void
    {
        if (!this._eventsAdded || !this.domElement)
        {
            return;
        }

        EventsTicker.removeTickerListener();

        const style = this.domElement.style as CrossCSSStyleDeclaration;

        // offscreen canvas does not have style, so check first
        if (style)
        {
            if ((globalThis.navigator as any).msPointerEnabled)
            {
                style.msContentZooming = '';
                style.msTouchAction = '';
            }
            else if (this.supportsPointerEvents)
            {
                style.touchAction = '';
            }
        }

        if (this.supportsPointerEvents)
        {
            globalThis.document.removeEventListener('pointermove', this._onPointerMove, true);
            this.domElement.removeEventListener('pointerdown', this._onPointerDown, true);
            this.domElement.removeEventListener('pointerleave', this._onPointerOverOut, true);
            this.domElement.removeEventListener('pointerover', this._onPointerOverOut, true);
            // globalThis.removeEventListener('pointercancel', this.onPointerCancel, true);
            globalThis.removeEventListener('pointerup', this._onPointerUp, true);
        }
        else
        {
            globalThis.document.removeEventListener('mousemove', this._onPointerMove, true);
            this.domElement.removeEventListener('mousedown', this._onPointerDown, true);
            this.domElement.removeEventListener('mouseout', this._onPointerOverOut, true);
            this.domElement.removeEventListener('mouseover', this._onPointerOverOut, true);
            globalThis.removeEventListener('mouseup', this._onPointerUp, true);

            if (this.supportsTouchEvents)
            {
                this.domElement.removeEventListener('touchstart', this._onPointerDown, true);
                // this.domElement.removeEventListener('touchcancel', this.onPointerCancel, true);
                this.domElement.removeEventListener('touchend', this._onPointerUp, true);
                this.domElement.removeEventListener('touchmove', this._onPointerMove, true);
            }
        }

        this.domElement.removeEventListener('wheel', this.onWheel, true);

        this.domElement = null;
        this._eventsAdded = false;
    }

    /**
     * Maps x and y coords from a DOM object and maps them correctly to the PixiJS view. The
     * resulting value is stored in the point. This takes into account the fact that the DOM
     * element could be scaled and positioned anywhere on the screen.
     * @param  {PointData} point - the point that the result will be stored in
     * @param  {number} x - the x coord of the position to map
     * @param  {number} y - the y coord of the position to map
     */
    public mapPositionToPoint(point: PointData, x: number, y: number): void
    {
        const rect = this.domElement.isConnected
            ? this.domElement.getBoundingClientRect()
            : {
                x: 0,
                y: 0,
                width: (this.domElement as any).width,
                height: (this.domElement as any).height,
                left: 0,
                top: 0
            };

        const resolutionMultiplier = 1.0 / this.resolution;

        point.x = ((x - rect.left) * ((this.domElement as any).width / rect.width)) * resolutionMultiplier;
        point.y = ((y - rect.top) * ((this.domElement as any).height / rect.height)) * resolutionMultiplier;
    }

    /**
     * Ensures that the original event object contains all data that a regular pointer event would have
     * @param event - The original event data from a touch or mouse event
     * @returns An array containing a single normalized pointer event, in the case of a pointer
     *  or mouse event, or a multiple normalized pointer events if there are multiple changed touches
     */
    private _normalizeToPointerData(event: TouchEvent | MouseEvent | PointerEvent): PointerEvent[]
    {
        const normalizedEvents = [];

        if (this.supportsTouchEvents && event instanceof TouchEvent)
        {
            for (let i = 0, li = event.changedTouches.length; i < li; i++)
            {
                const touch = event.changedTouches[i] as PixiTouch;

                if (typeof touch.button === 'undefined') touch.button = 0;
                if (typeof touch.buttons === 'undefined') touch.buttons = 1;
                if (typeof touch.isPrimary === 'undefined')
                {
                    touch.isPrimary = event.touches.length === 1 && event.type === 'touchstart';
                }
                if (typeof touch.width === 'undefined') touch.width = touch.radiusX || 1;
                if (typeof touch.height === 'undefined') touch.height = touch.radiusY || 1;
                if (typeof touch.tiltX === 'undefined') touch.tiltX = 0;
                if (typeof touch.tiltY === 'undefined') touch.tiltY = 0;
                if (typeof touch.pointerType === 'undefined') touch.pointerType = 'touch';
                if (typeof touch.pointerId === 'undefined') touch.pointerId = touch.identifier || 0;
                if (typeof touch.pressure === 'undefined') touch.pressure = touch.force || 0.5;
                if (typeof touch.twist === 'undefined') touch.twist = 0;
                if (typeof touch.tangentialPressure === 'undefined') touch.tangentialPressure = 0;
                // TODO: Remove these, as layerX/Y is not a standard, is deprecated, has uneven
                // support, and the fill ins are not quite the same
                // offsetX/Y might be okay, but is not the same as clientX/Y when the canvas's top
                // left is not 0,0 on the page
                if (typeof touch.layerX === 'undefined') touch.layerX = touch.offsetX = touch.clientX;
                if (typeof touch.layerY === 'undefined') touch.layerY = touch.offsetY = touch.clientY;

                // mark the touch as normalized, just so that we know we did it
                touch.isNormalized = true;
                touch.type = event.type;

                normalizedEvents.push(touch);
            }
        }
        // apparently PointerEvent subclasses MouseEvent, so yay
        else if (!globalThis.MouseEvent
            || (event instanceof MouseEvent && (!this.supportsPointerEvents || !(event instanceof globalThis.PointerEvent))))
        {
            const tempEvent = event as PixiPointerEvent;

            if (typeof tempEvent.isPrimary === 'undefined') tempEvent.isPrimary = true;
            if (typeof tempEvent.width === 'undefined') tempEvent.width = 1;
            if (typeof tempEvent.height === 'undefined') tempEvent.height = 1;
            if (typeof tempEvent.tiltX === 'undefined') tempEvent.tiltX = 0;
            if (typeof tempEvent.tiltY === 'undefined') tempEvent.tiltY = 0;
            if (typeof tempEvent.pointerType === 'undefined') tempEvent.pointerType = 'mouse';
            if (typeof tempEvent.pointerId === 'undefined') tempEvent.pointerId = MOUSE_POINTER_ID;
            if (typeof tempEvent.pressure === 'undefined') tempEvent.pressure = 0.5;
            if (typeof tempEvent.twist === 'undefined') tempEvent.twist = 0;
            if (typeof tempEvent.tangentialPressure === 'undefined') tempEvent.tangentialPressure = 0;

            // mark the mouse event as normalized, just so that we know we did it
            tempEvent.isNormalized = true;

            normalizedEvents.push(tempEvent);
        }
        else
        {
            normalizedEvents.push(event);
        }

        return normalizedEvents as PointerEvent[];
    }

    /**
     * Normalizes the native {@link https://w3c.github.io/uievents/#interface-wheelevent WheelEvent}.
     *
     * The returned {@link FederatedWheelEvent} is a shared instance. It will not persist across
     * multiple native wheel events.
     * @param nativeEvent - The native wheel event that occurred on the canvas.
     * @returns A federated wheel event.
     */
    protected normalizeWheelEvent(nativeEvent: WheelEvent): FederatedWheelEvent
    {
        const event = this._rootWheelEvent;

        this._transferMouseData(event, nativeEvent);

        // When WheelEvent is triggered by scrolling with mouse wheel, reading WheelEvent.deltaMode
        // before deltaX/deltaY/deltaZ on Firefox will result in WheelEvent.DOM_DELTA_LINE (1),
        // while reading WheelEvent.deltaMode after deltaX/deltaY/deltaZ on Firefox or reading
        // in any order on other browsers will result in WheelEvent.DOM_DELTA_PIXEL (0).
        // Therefore, we need to read WheelEvent.deltaMode after deltaX/deltaY/deltaZ in order to
        // make its behavior more consistent across browsers.
        // @see https://github.com/pixijs/pixijs/issues/8970
        event.deltaX = nativeEvent.deltaX;
        event.deltaY = nativeEvent.deltaY;
        event.deltaZ = nativeEvent.deltaZ;
        event.deltaMode = nativeEvent.deltaMode;

        this.mapPositionToPoint(event.screen, nativeEvent.clientX, nativeEvent.clientY);
        event.global.copyFrom(event.screen);
        event.offset.copyFrom(event.screen);

        event.nativeEvent = nativeEvent;
        event.type = nativeEvent.type;

        return event;
    }

    /**
     * Normalizes the `nativeEvent` into a federateed {@link FederatedPointerEvent}.
     * @param event
     * @param nativeEvent
     */
    private _bootstrapEvent(event: FederatedPointerEvent, nativeEvent: PointerEvent): FederatedPointerEvent
    {
        event.originalEvent = null;
        event.nativeEvent = nativeEvent;

        event.pointerId = nativeEvent.pointerId;
        event.width = nativeEvent.width;
        event.height = nativeEvent.height;
        event.isPrimary = nativeEvent.isPrimary;
        event.pointerType = nativeEvent.pointerType;
        event.pressure = nativeEvent.pressure;
        event.tangentialPressure = nativeEvent.tangentialPressure;
        event.tiltX = nativeEvent.tiltX;
        event.tiltY = nativeEvent.tiltY;
        event.twist = nativeEvent.twist;
        this._transferMouseData(event, nativeEvent);

        this.mapPositionToPoint(event.screen, nativeEvent.clientX, nativeEvent.clientY);
        event.global.copyFrom(event.screen);// global = screen for top-level
        event.offset.copyFrom(event.screen);// EventBoundary recalculates using its rootTarget

        event.isTrusted = nativeEvent.isTrusted;
        if (event.type === 'pointerleave')
        {
            event.type = 'pointerout';
        }
        if (event.type.startsWith('mouse'))
        {
            event.type = event.type.replace('mouse', 'pointer');
        }
        if (event.type.startsWith('touch'))
        {
            event.type = TOUCH_TO_POINTER[event.type] || event.type;
        }

        return event;
    }

    /**
     * Transfers base & mouse event data from the `nativeEvent` to the federated event.
     * @param event
     * @param nativeEvent
     */
    private _transferMouseData(event: FederatedMouseEvent, nativeEvent: MouseEvent): void
    {
        event.isTrusted = nativeEvent.isTrusted;
        event.srcElement = nativeEvent.srcElement;
        event.timeStamp = performance.now();
        event.type = nativeEvent.type;

        event.altKey = nativeEvent.altKey;
        event.button = nativeEvent.button;
        event.buttons = nativeEvent.buttons;
        event.client.x = nativeEvent.clientX;
        event.client.y = nativeEvent.clientY;
        event.ctrlKey = nativeEvent.ctrlKey;
        event.metaKey = nativeEvent.metaKey;
        event.movement.x = nativeEvent.movementX;
        event.movement.y = nativeEvent.movementY;
        event.page.x = nativeEvent.pageX;
        event.page.y = nativeEvent.pageY;
        event.relatedTarget = null;
        event.shiftKey = nativeEvent.shiftKey;
    }
}

interface CrossCSSStyleDeclaration extends CSSStyleDeclaration
{
    msContentZooming: string;
    msTouchAction: string;
}

interface PixiPointerEvent extends PointerEvent
{
    isPrimary: boolean;
    width: number;
    height: number;
    tiltX: number;
    tiltY: number;
    pointerType: string;
    pointerId: number;
    pressure: number;
    twist: number;
    tangentialPressure: number;
    isNormalized: boolean;
    type: string;
}
