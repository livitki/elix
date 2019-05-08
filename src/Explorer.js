import * as symbols from './symbols.js';
import * as template from './template.js';
import * as updates from './updates.js';
import LanguageDirectionMixin from './LanguageDirectionMixin.js';
import ListBox from './ListBox.js';
import Modes from './Modes.js';
import ReactiveElement from './ReactiveElement.js';
import SingleSelectionMixin from './SingleSelectionMixin.js';
import SlotItemsMixin from './SlotItemsMixin.js';


const proxySlotchangeFiredKey = Symbol('proxySlotchangeFired');

// Does a list position imply a lateral arrangement of list and stage?
const lateralPositions = {
  end: true,
  left: true,
  right: true,
  start: true
};


const Base =
  LanguageDirectionMixin(
  SingleSelectionMixin(
  SlotItemsMixin(
    ReactiveElement
  )));


/**
 * Combines a list with an area focusing on a single selected item.
 *
 * @inherits ReactiveElement
 * @mixes LanguageDirectionMixin
 * @mixes SingleSelectionMixin
 * @mixes SlotItemsMixin
 * @elementrole {'div'} proxy
 * @elementrole {ListBox} proxyList
 * @elementrole {Modes} stage
 */
class Explorer extends Base {

  [symbols.checkSize]() {
    if (super[symbols.checkSize]) { super[symbols.checkSize](); }
    if (this.$.stage[symbols.checkSize]) {
      this.$.stage[symbols.checkSize]();
    }
    if (this.$.proxyList[symbols.checkSize]) {
      this.$.proxyList[symbols.checkSize]();
    }
  }

  componentDidMount() {
    if (super.componentDidMount) { super.componentDidMount(); }

    // Work around inconsistencies in slotchange timing; see SlotContentMixin.
    this.$.proxySlot.addEventListener('slotchange', () => {
      this[proxySlotchangeFiredKey] = true;
      updateAssignedProxies(this);
    });
    Promise.resolve().then(() => {
      if (!this[proxySlotchangeFiredKey]) {
        // The event didn't fire, so we're most likely in Safari.
        // Update our notion of the component content.
        this[proxySlotchangeFiredKey] = true;
        updateAssignedProxies(this);
      }
    });
  }

  get defaultState() {
    const state = Object.assign(super.defaultState, {
      assignedProxies: [],
      defaultProxies: [],
      proxyRole: 'div',
      proxyListOverlap: false,
      proxyListPosition: 'top',
      proxyListRole: ListBox,
      selectionRequired: true,
      stageRole: Modes
    });

    // If items for default proxies have changed, recreate the proxies.
    state.onChange(['assignedProxies', 'proxyRole', 'items'], (state, changed) => {
      const {
        assignedProxies,
        items,
        proxyRole
      } = state;
      if (changed.assignedProxies && assignedProxies.length > 0) {
        // Assigned proxies take precedence, remove default proxies.
        return {
          defaultProxies: []
        };
      } else if ((changed.items || changed.proxyRole) &&
          assignedProxies.length === 0) {
        // Generate sufficient default proxies.
        return {
          defaultProxies: createDefaultProxies(items, proxyRole)
        };
      }
      return null;
    });

    return state;
  }

  [symbols.populate](state, changed) {
    if (super[symbols.populate]) { super[symbols.populate](state, changed); }

    const handleSelectedIndexChanged = event => {
      this[symbols.raiseChangeEvents] = true;
      const selectedIndex = event.detail.selectedIndex;
      if (this.selectedIndex !== selectedIndex) {
        this.selectedIndex = selectedIndex;
      }
      this[symbols.raiseChangeEvents] = false;
    };

    if (changed.proxyListRole) {
      template.transmute(this.$.proxyList, this.state.proxyListRole);
      this.$.proxyList.addEventListener('selected-index-changed', handleSelectedIndexChanged);
    }

    if (changed.stageRole) {
      template.transmute(this.$.stage, this.state.stageRole);
      this.$.stage.addEventListener('selected-index-changed', handleSelectedIndexChanged);
    }
  }

  /**
   * The current set of proxy elements that correspond to the component's
   * main `items`. If you have assigned elements to the `proxy` slot, this
   * returns the collection of those elements. Otherwise, this will return
   * a collection of default proxies generated by the component, one for
   * each item.
   * 
   * @type {Element[]}
   */
  get proxies() {
    return this.state.defaultProxies.length > 0 ?
      this.state.defaultProxies :
      this.state.assignedProxies;
  }

  /**
   * True if the list of proxies should overlap the stage, false if not.
   * 
   * @type {boolean}
   * @default false
   */
  get proxyListOverlap() {
    return this.state.proxyListOverlap;
  }
  set proxyListOverlap(proxyListOverlap) {
    const parsed = String(proxyListOverlap) === 'true';
    this.setState({
      proxyListOverlap: parsed
    });
  }

  /**
   * The position of the proxy list relative to the stage.
   * 
   * The `start` and `end` values refer to text direction: in left-to-right
   * languages such as English, these are equivalent to `left` and `right`,
   * respectively.
   * 
   * @type {('bottom'|'end'|'left'|'right'|'start'|'top')}
   * @default 'start'
   */
  get proxyListPosition() {
    return this.state.proxyListPosition;
  }
  set proxyListPosition(proxyListPosition) {
    this.setState({ proxyListPosition });
  }

  /**
   * The class, tag, or template used to create the Explorer's list of proxies.
   * 
   * @type {function|string|HTMLTemplateElement}
   * @default ListBox
   */
  get proxyListRole() {
    return this.state.proxyListRole;
  }
  set proxyListRole(proxyListRole) {
    this.setState({ proxyListRole });
  }

  /**
   * The class, tag, or template used to create default proxies for the list
   * items.
   * 
   * @type {function|string|HTMLTemplateElement}
   * @default 'div'
   */
  get proxyRole() {
    return this.state.proxyRole;
  }
  set proxyRole(proxyRole) {
    this.setState({ proxyRole });
  }

  [symbols.render](state, changed) {
    if (super[symbols.render]) { super[symbols.render](state, changed); }
    const proxyList = this.$.proxyList;
    const stage = this.$.stage;
    if (changed.defaultProxies) {
      // Render the default proxies.
      const childNodes = [this.$.proxySlot, ...this.state.defaultProxies];
      updates.applyChildNodes(this.$.proxyList, childNodes);
    }
    if (changed.languageDirection || changed.proxyListPosition) {
      // Map the relative position of the list vis-a-vis the stage to a position
      // from the perspective of the list.
      const cast = /** @type {any} */ (proxyList);
      if ('position' in cast) {
        const proxyListPosition = state.proxyListPosition;
        const rightToLeft = state.languageDirection === 'rtl';
        let position;
        switch (proxyListPosition) {
          case 'end':
            position = rightToLeft ? 'left' : 'right';
            break;
          case 'start':
            position = rightToLeft ? 'right' : 'left';
            break;
          default:
            position = proxyListPosition;
            break;
        }
        cast.position = position;
      }
    }
    if (changed.proxyListOverlap || changed.proxyListPosition || changed.proxyListRole) {
      const { proxyListOverlap } = state;
      const lateralPosition = lateralPositions[state.proxyListPosition];
      Object.assign(proxyList.style, {
        height: lateralPosition ? '100%' : null,
        position: proxyListOverlap ? 'absolute' : null,
        width: lateralPosition ? null : '100%',
        zIndex: proxyListOverlap ? '1' : null
      });
    }
    if (changed.proxyListPosition || changed.proxyListRole) {
      setListAndStageOrder(this, state);
      const { proxyListPosition } = state;
      const lateralPosition = lateralPositions[proxyListPosition];
      this.$.explorerContainer.style.flexDirection = lateralPosition ? 'row' : 'column';
      Object.assign(proxyList.style, {
        bottom: proxyListPosition === 'bottom' ? '0' : null,
        left: proxyListPosition === 'left' ? '0' : null,
        right: proxyListPosition === 'right' ? '0' : null,
        top: proxyListPosition === 'top' ? '0' : null,
      });
    }
    if (changed.selectedIndex || changed.proxyListRole) {
      if ('selectedIndex' in proxyList) {
        /** @type {any} */ (proxyList).selectedIndex = state.selectedIndex;
      }
    }
    if (changed.selectedIndex || changed.stageRole) {
      if ('selectedIndex' in stage) {
        /** @type {any} */ (stage).selectedIndex = state.selectedIndex;
      }
    }
    if (changed.selectionRequired || changed.proxyListRole) {
      if ('selectionRequired' in proxyList) {
        /** @type {any} */ (proxyList).selectionRequired = state.selectionRequired;
      }
    }
    if (changed.swipeFraction || changed.proxyListRole) {
      if ('swipeFraction' in proxyList) {
        /** @type {any} */ (proxyList).swipeFraction = state.swipeFraction;
      }
    }
    if (changed.swipeFraction || changed.stageRole) {
      if ('swipeFraction' in stage) {
        /** @type {any} */ (stage).swipeFraction = state.swipeFraction;
      }
    }
  }

  /**
   * The class, tag, or template used for the main "stage" element that shows a
   * single item at a time.
   * 
   * @type {function|string|HTMLTemplateElement}
   * @default Modes
   */
  get stageRole() {
    return this.state.stageRole;
  }
  set stageRole(stageRole) {
    this.setState({ stageRole });
  }

  get [symbols.template]() {
    return template.html`
      <style>
        :host {
          display: inline-flex;
        }
        
        #explorerContainer {
          display: flex;
          flex: 1;
          max-width: 100%; /* For Firefox */
          position: relative;
        }

        #stage {
          flex: 1;
        }
      </style>
      <div id="explorerContainer" role="none">
        <div id="proxyList"><slot id="proxySlot" name="proxy"></slot></div>
        <div id="stage" role="none"><slot></slot></div>
      </div>
    `;
  }

}


// Return the default list generated for the given items.
function createDefaultProxies(items, proxyRole) {
  const proxies = items ?
    items.map(() => template.createElement(proxyRole)) :
    [];
  // Make the array immutable to help update performance.
  Object.freeze(proxies);
  return proxies;
}


// Find the child of root that is or contains the given node.
function findChildContainingNode(root, node) {
  const parentNode = node.parentNode;
  return parentNode === root ?
    node :
    findChildContainingNode(root, parentNode);
}


// Physically reorder the list and stage to reflect the desired arrangement. We
// could change the visual appearance by reversing the order of the flex box,
// but then the visual order wouldn't reflect the document order, which
// determines focus order. That would surprise a user trying to tab through the
// controls.
function setListAndStageOrder(element, state) {
  const { languageDirection, proxyListPosition } = state;
  const rightToLeft = languageDirection === 'rtl';
  const listInInitialPosition =
      proxyListPosition === 'top' ||
      proxyListPosition === 'start' ||
      proxyListPosition === 'left' && !rightToLeft ||
      proxyListPosition === 'right' && rightToLeft;
  const container = element.$.explorerContainer;
  const stage = findChildContainingNode(container, element.$.stage);
  const list = findChildContainingNode(container, element.$.proxyList);
  const firstElement = listInInitialPosition ? list : stage;
  const lastElement = listInInitialPosition ? stage : list;
  if (firstElement.nextElementSibling !== lastElement) {
    element.$.explorerContainer.insertBefore(firstElement, lastElement);
  }
}


function updateAssignedProxies(element) {
  const proxySlot = element.$.proxySlot;
  const assignedProxies = proxySlot.assignedNodes({ flatten: true });
  element.setState({
    assignedProxies
  });
}


customElements.define('elix-explorer', Explorer);
export default Explorer;
