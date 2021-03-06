import * as symbols from './symbols.js';
import ReactiveElement from './ReactiveElement.js'; // eslint-disable-line no-unused-vars
import State from './State.js';


/** @type {any} */
const mountedKey = Symbol('mounted');
/** @type {any} */
const stateKey = Symbol('state');
/** @type {any} */
const raiseChangeEventsInNextRenderKey = Symbol('raiseChangeEventsInNextRender');


// Tracks total set of changes made to elements since their last render.
const changedSinceLastRender = new WeakMap();


/**
 * Manages component state and renders changes in state
 * 
 * This is modeled after React/Preact's state management, and is adapted for
 * use with web components. Applying this mixin to a component will give it
 * FRP behavior comparable to React's.
 * 
 * @module ReactiveMixin
 * @param {Constructor<ReactiveElement>} Base
 */
export default function ReactiveMixin(Base) {
  return class Reactive extends Base {

    constructor() {
      // @ts-ignore
      super();
      // Set the initial state from the default state defined by the component
      // and its mixins.
      this.setState(this.defaultState);
    }

    componentDidMount() {
      if (super.componentDidMount) { super.componentDidMount(); }
    }

    componentDidUpdate(/** @type {PlainObject} */ changed) {
      if (super.componentDidUpdate) { super.componentDidUpdate(changed); }
    }

    connectedCallback() {
      if (super.connectedCallback) { super.connectedCallback(); }
      // Render the component. If the component was forced to render before this
      // point, and the state hasn't changed, this call will be a no-op.
      this.render();
    }

    /**
     * The default state for the component. This can be extended by mixins and
     * classes to provide additional default state.
     * 
     * @type {State}
     */
    get defaultState() {
      return new State();
    }

    /**
     * Render pending component changes to the DOM.
     * 
     * This method does nothing if the state has not changed since the last
     * render call.
     * 
     * This method invokes all internal render methods. It then invoked
     * `componentDidMount` (for first render) or `componentDidUpdate` (for
     * subsequent renders).
     */
    render() {

      // Determine what's changed since the last render.
      const changed = changedSinceLastRender.get(this);

      // We only render if the component's never been rendered before, or is
      // something's actually changed since the last render. Consecutive
      // synchronous setState calls will queue up corresponding async render
      // calls. By the time the first render call actually happens, the complete
      // state is available, and that is what is rendered. When the following
      // render calls happen, they will see that the complete state has already
      // been rendered, and skip doing any work.
      if (!this[mountedKey] || changed !== null) {

        // If at least one of the setState calls was made in response to user
        // interaction or some other component-internal event, set the
        // raiseChangeEvents flag so that componentDidMount/componentDidUpdate
        // know whether to raise property change events.
        const saveRaiseChangeEvents = this[symbols.raiseChangeEvents];
        this[symbols.raiseChangeEvents] = this[raiseChangeEventsInNextRenderKey];

        // We set a flag to indicate that rendering is happening. The component
        // may use this to avoid triggering other updates during the render.
        this[symbols.rendering] = true;

        // Invoke any internal render implementations.
        this[symbols.render](changed);

        this[symbols.rendering] = false;

        // Since we've now rendered all changes, clear the change log. If other
        // async render calls are queued up behind this call, they'll see an
        // empty change log, and so skip unnecessary render work.
        changedSinceLastRender.set(this, null);

        // Let the component know it was rendered.
        // First time is consider mounting; subsequent times are updates.
        if (!this[mountedKey]) {
          this.componentDidMount();
          this[mountedKey] = true;
        } else {
          this.componentDidUpdate(changed);
        }

        // Restore state of event flags.
        this[symbols.raiseChangeEvents] = saveRaiseChangeEvents;
        this[raiseChangeEventsInNextRenderKey] = saveRaiseChangeEvents;
      }
    }

    /**
     * Internal method for rendering any recent changes in state to the DOM.
     * 
     * The default implementation of this method does nothing. Override this
     * method in your component to update your component's host element and
     * any shadow elements to reflect the component's new state. See the
     * [rendering example](ReactiveMixin#rendering).
     * 
     * Be sure to call `super` in your method implementation so that your
     * component's base classes and mixins have a chance to perform their own
     * render work.
     * 
     * @param {object} changed - dictionary of flags indicating which state
     * members have changed since the last render
     */
    [symbols.render](/** @type {PlainObject} */ changed) {
      if (super[symbols.render]) { super[symbols.render](changed); }
    }

    /**
     * Update the component's state by merging the specified changes on
     * top of the existing state. If the component is connected to the document,
     * and the new state has changed, this returns a promise to asynchronously
     * render the component. Otherwise, this returns a resolved promise.
     * 
     * @param {object} changes - the changes to apply to the element's state
     * @returns {Promise} - resolves when the new state has been rendered
     */
    async setState(changes) {
      // There's no good reason to have a render method update state.
      if (this[symbols.rendering]) {
        /* eslint-disable no-console */
        console.warn(`${this.constructor.name} called setState during rendering, which you should avoid.\nSee https://elix.org/documentation/ReactiveMixin.`);
      }

      const firstSetState = this[stateKey] === undefined;
      if (firstSetState) {
        // Create temporary state as seed.
        this[stateKey] = Object.freeze(new State());
      }

      const { state, changed } = this[stateKey].copyWithChanges(changes);

      const renderWorthy = firstSetState || changed;
      if (!renderWorthy) {
        // No need to update state.
        return;
      }

      // Freeze the new state so it's immutable. This prevents accidental
      // attempts to set state without going through setState.
      Object.freeze(state);

      // Set the new state.
      this[stateKey] = state;

      // Log the changes.
      const log = changedSinceLastRender.get(this) || {};
      Object.assign(log, changed);
      changedSinceLastRender.set(this, log);

      if (!(this.isConnected && renderWorthy)) {
        // Not in document or no worthwhile changes to render.
        return;
      }

      // Remember whether we're supposed to raise property change events.
      if (this[symbols.raiseChangeEvents]) {
        this[raiseChangeEventsInNextRenderKey] = true;
      }
      
      // Yield with promise timing. This lets any *synchronous* setState
      // calls that happen after the current setState call complete first.
      // Their effects on the state will be batched up before the render
      // call below actually happens.
      await Promise.resolve();
      
      // Render the component.
      this.render();
    }

    /**
     * The component's current state.
     * The returned state object is immutable. To update it, invoke `setState`.
     * 
     * @type {State}
     */
    get state() {
      return this[stateKey];
    }
  }
}
