import type {
  VirtualElement,
  VirtualElementComponent,
  VirtualElementTag,
  VirtualElementParent,
  VirtualElementChildren,
  VirtualElementReal,
  VirtualElementFragment,
} from './teact';
import {
  hasElementChanged,
  isComponentElement,
  isTagElement,
  isParentElement,
  isTextElement,
  isEmptyElement,
  mountComponent,
  renderComponent,
  unmountComponent,
  isFragmentElement,
  captureImmediateEffects,
} from './teact';
import { DEBUG } from '../../config';
import { addEventListener, removeAllDelegatedListeners, removeEventListener } from './dom-events';
import { unique } from '../../util/iteratees';

interface VirtualDomHead {
  children: [VirtualElement] | [];
}

interface SelectionState {
  selectionStart: number | null;
  selectionEnd: number | null;
  isCaretAtEnd: boolean;
}

const FILTERED_ATTRIBUTES = new Set(['key', 'ref', 'teactFastList', 'teactOrderKey']);
const HTML_ATTRIBUTES = new Set(['dir', 'role', 'form']);
const CONTROLLABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
const MAPPED_ATTRIBUTES: { [k: string]: string } = {
  autoPlay: 'autoplay',
  autoComplete: 'autocomplete',
};
const INDEX_KEY_PREFIX = '__indexKey#';

const headsByElement = new WeakMap<Element, VirtualDomHead>();
const extraClasses = new WeakMap<Element, Set<string>>();

// eslint-disable-next-line @typescript-eslint/naming-convention
let DEBUG_virtualTreeSize = 1;

function render($element: VirtualElement | undefined, parentEl: HTMLElement) {
  if (!headsByElement.has(parentEl)) {
    headsByElement.set(parentEl, { children: [] });
  }

  const runImmediateEffects = captureImmediateEffects();
  const $head = headsByElement.get(parentEl)!;
  const $newElement = renderWithVirtual(parentEl, $head.children[0], $element, $head, 0);
  runImmediateEffects?.();

  $head.children = $newElement ? [$newElement] : [];

  if (process.env.APP_ENV === 'perf') {
    DEBUG_virtualTreeSize = 0;
    DEBUG_addToVirtualTreeSize($head);

    return DEBUG_virtualTreeSize;
  }

  return undefined;
}

function renderWithVirtual<T extends VirtualElement | undefined>(
  parentEl: HTMLElement,
  $current: VirtualElement | undefined,
  $new: T,
  $parent: VirtualElementParent | VirtualDomHead,
  index: number,
  options: {
    skipComponentUpdate?: boolean;
    nextSibling?: ChildNode;
    forceMoveToEnd?: boolean;
    fragment?: DocumentFragment;
  } = {},
): T {
  const { skipComponentUpdate, fragment } = options;
  let { nextSibling } = options;

  const isCurrentComponent = $current && isComponentElement($current);
  const isNewComponent = $new && isComponentElement($new);
  const $newAsReal = $new as VirtualElementReal;

  const isCurrentFragment = $current && !isCurrentComponent && isFragmentElement($current);
  const isNewFragment = $new && !isNewComponent && isFragmentElement($new);

  if (
    !skipComponentUpdate
    && isCurrentComponent && isNewComponent
    && !hasElementChanged($current!, $new!)
  ) {
    $new = updateComponent($current, $new as VirtualElementComponent) as typeof $new;
  }

  // Parent element may have changed, so we need to update the listener closure.
  if (!skipComponentUpdate && isNewComponent && ($new as VirtualElementComponent).componentInstance.isMounted) {
    setupComponentUpdateListener(parentEl, $new as VirtualElementComponent, $parent, index);
  }

  if ($current === $new) {
    return $new;
  }

  if (DEBUG && $new) {
    const newTarget = 'target' in $new && $new.target;
    if (newTarget && (!$current || ('target' in $current && newTarget !== $current.target))) {
      throw new Error('[Teact] Cached virtual element was moved within tree');
    }
  }

  if (!$current && $new) {
    if (isNewComponent || isNewFragment) {
      if (isNewComponent) {
        $new = initComponent(parentEl, $new as VirtualElementComponent, $parent, index) as unknown as typeof $new;
      }

      mountChildren(parentEl, $new as VirtualElementComponent | VirtualElementFragment, { nextSibling, fragment });
    } else {
      const node = createNode($newAsReal);
      $newAsReal.target = node;
      insertBefore(fragment || parentEl, node, nextSibling);

      if (isTagElement($newAsReal)) {
        setElementRef($newAsReal, node as HTMLElement);
      }
    }
  } else if ($current && !$new) {
    remount(parentEl, $current, undefined);
  } else if ($current && $new) {
    if (hasElementChanged($current, $new)) {
      if (!nextSibling) {
        nextSibling = getNextSibling($current);
      }

      if (isNewComponent || isNewFragment) {
        if (isNewComponent) {
          $new = initComponent(parentEl, $new as VirtualElementComponent, $parent, index) as unknown as typeof $new;
        }

        remount(parentEl, $current, undefined);
        mountChildren(parentEl, $new as VirtualElementComponent | VirtualElementFragment, { nextSibling, fragment });
      } else {
        const node = createNode($newAsReal);
        $newAsReal.target = node;
        remount(parentEl, $current, node, nextSibling);

        if (isTagElement($newAsReal)) {
          setElementRef($newAsReal, node as HTMLElement);
        }
      }
    } else {
      const isComponent = isCurrentComponent && isNewComponent;
      const isFragment = isCurrentFragment && isNewFragment;

      if (isComponent || isFragment) {
        ($new as VirtualElementComponent | VirtualElementFragment).children = renderChildren(
          $current,
          $new as VirtualElementComponent | VirtualElementFragment,
          parentEl,
          nextSibling,
          options.forceMoveToEnd,
        );
      } else {
        const $currentAsReal = $current as VirtualElementReal;
        const currentTarget = $currentAsReal.target!;

        $newAsReal.target = currentTarget;
        $currentAsReal.target = undefined; // Help GC

        const isTag = isTagElement($current);
        if (isTag) {
          const $newAsTag = $new as VirtualElementTag;

          setElementRef($current, undefined);
          setElementRef($newAsTag, currentTarget as HTMLElement);

          if (nextSibling || options.forceMoveToEnd) {
            insertBefore(parentEl, currentTarget, nextSibling);
          }

          updateAttributes($current, $newAsTag, currentTarget as HTMLElement);

          $newAsTag.children = renderChildren(
            $current,
            $newAsTag,
            currentTarget as HTMLElement,
          );
        }
      }
    }
  }

  return $new;
}

function initComponent(
  parentEl: HTMLElement,
  $element: VirtualElementComponent,
  $parent: VirtualElementParent | VirtualDomHead,
  index: number,
) {
  const { componentInstance } = $element;

  if (!componentInstance.isMounted) {
    $element = mountComponent(componentInstance);
    setupComponentUpdateListener(parentEl, $element, $parent, index);

    const $firstChild = $element.children[0];
    if (isComponentElement($firstChild)) {
      $element.children = [initComponent(parentEl, $firstChild, $element, 0)];
    }

    componentInstance.isMounted = true;
  }

  return $element;
}

function updateComponent($current: VirtualElementComponent, $new: VirtualElementComponent) {
  $current.componentInstance.props = $new.componentInstance.props;

  return renderComponent($current.componentInstance);
}

function setupComponentUpdateListener(
  parentEl: HTMLElement,
  $element: VirtualElementComponent,
  $parent: VirtualElementParent | VirtualDomHead,
  index: number,
) {
  const { componentInstance } = $element;

  componentInstance.onUpdate = () => {
    $parent.children[index] = renderWithVirtual(
      parentEl,
      $parent.children[index],
      componentInstance.$element,
      $parent,
      index,
      { skipComponentUpdate: true },
    );
  };
}

function mountChildren(
  parentEl: HTMLElement,
  $element: VirtualElementComponent | VirtualElementFragment,
  options: {
    nextSibling?: ChildNode;
    fragment?: DocumentFragment;
  },
) {
  $element.children = $element.children.map(($child, i) => {
    return renderWithVirtual(parentEl, undefined, $child, $element, i, options);
  });
}

function unmountChildren(parentEl: HTMLElement, $element: VirtualElementComponent | VirtualElementFragment) {
  $element.children.forEach(($child) => {
    renderWithVirtual(parentEl, $child, undefined, $element, -1);
  });
}

function createNode($element: VirtualElementReal): Node {
  if (isEmptyElement($element)) {
    return document.createTextNode('');
  }

  if (isTextElement($element)) {
    return document.createTextNode($element.value);
  }

  const { tag, props, children = [] } = $element;
  const element = document.createElement(tag);

  processControlled(tag, props);

  Object.entries(props).forEach(([key, value]) => {
    if (props[key] !== undefined) {
      setAttribute(element, key, value);
    }
  });

  processUncontrolledOnMount(element, props);

  $element.children = children.map(($child, i) => (
    renderWithVirtual(element, undefined, $child, $element, i)
  ));

  return element;
}

function remount(
  parentEl: HTMLElement,
  $current: VirtualElement,
  node: Node | undefined,
  componentNextSibling?: ChildNode,
) {
  const isComponent = isComponentElement($current);
  const isFragment = !isComponent && isFragmentElement($current);

  if (isComponent || isFragment) {
    if (isComponent) {
      unmountComponent($current.componentInstance);
    }

    unmountChildren(parentEl, $current);

    if (node) {
      insertBefore(parentEl, node, componentNextSibling);
    }
  } else {
    if (node) {
      parentEl.replaceChild(node, $current.target!);
    } else {
      parentEl.removeChild($current.target!);
    }

    unmountRealTree($current);
  }
}

function unmountRealTree($element: VirtualElement) {
  if (isComponentElement($element)) {
    unmountComponent($element.componentInstance);
  } else if (!isFragmentElement($element)) {
    if (isTagElement($element)) {
      extraClasses.delete($element.target!);
      removeAllDelegatedListeners($element.target!);
      setElementRef($element, undefined);
    }

    $element.target = undefined; // Help GC

    if (!isParentElement($element)) {
      return;
    }
  }

  $element.children.forEach(unmountRealTree);
}

function insertBefore(parentEl: HTMLElement | DocumentFragment, node: Node, nextSibling?: ChildNode) {
  if (nextSibling) {
    parentEl.insertBefore(node, nextSibling);
  } else {
    parentEl.appendChild(node);
  }
}

function getNextSibling($current: VirtualElement): ChildNode | undefined {
  if (isComponentElement($current) || isFragmentElement($current)) {
    const lastChild = $current.children[$current.children.length - 1];
    return getNextSibling(lastChild);
  }

  return $current.target!.nextSibling || undefined;
}

function renderChildren(
  $current: VirtualElementParent,
  $new: VirtualElementParent,
  currentEl: HTMLElement,
  nextSibling?: ChildNode,
  forceMoveToEnd = false,
) {
  if (DEBUG) {
    DEBUG_checkKeyUniqueness($new.children);
  }

  if (('props' in $new) && $new.props.teactFastList) {
    return renderFastListChildren($current, $new, currentEl);
  }

  const currentChildrenLength = $current.children.length;
  const newChildrenLength = $new.children.length;
  const maxLength = Math.max(currentChildrenLength, newChildrenLength);
  const newChildren = [];

  const fragment = newChildrenLength > currentChildrenLength ? document.createDocumentFragment() : undefined;
  const lastCurrentChild = $current.children[currentChildrenLength - 1];
  const fragmentNextSibling = fragment && (
    nextSibling || (lastCurrentChild ? getNextSibling(lastCurrentChild) : undefined)
  );

  for (let i = 0; i < maxLength; i++) {
    const $newChild = renderWithVirtual(
      currentEl,
      $current.children[i],
      $new.children[i],
      $new,
      i,
      i >= currentChildrenLength ? { fragment } : { nextSibling, forceMoveToEnd },
    );

    if ($newChild) {
      newChildren.push($newChild);
    }
  }

  if (fragment) {
    insertBefore(currentEl, fragment, fragmentNextSibling);
  }

  return newChildren;
}

// This function allows to prepend/append a bunch of new DOM nodes to the top/bottom of preserved ones.
// It also allows to selectively move particular preserved nodes within their DOM list.
function renderFastListChildren($current: VirtualElementParent, $new: VirtualElementParent, currentEl: HTMLElement) {
  const newKeys = new Set(
    $new.children.map(($newChild) => {
      const key = 'props' in $newChild ? $newChild.props.key : undefined;

      if (DEBUG && isParentElement($newChild)) {
        // eslint-disable-next-line no-null/no-null
        if (key === undefined || key === null) {
          // eslint-disable-next-line no-console
          console.warn('Missing `key` in `teactFastList`');
        }

        if (isFragmentElement($newChild)) {
          throw new Error('[Teact] Fragment can not be child of container with `teactFastList`');
        }
      }

      return key;
    }),
  );

  // Build a collection of old children that also remain in the new list
  let currentRemainingIndex = 0;
  const remainingByKey = $current.children
    .reduce((acc, $currentChild, i) => {
      let key = 'props' in $currentChild ? $currentChild.props.key : undefined;
      // eslint-disable-next-line no-null/no-null
      const isKeyPresent = key !== undefined && key !== null;

      // First we process removed children
      if (isKeyPresent && !newKeys.has(key)) {
        renderWithVirtual(currentEl, $currentChild, undefined, $new, -1);

        return acc;
      } else if (!isKeyPresent) {
        const $newChild = $new.children[i];
        const newChildKey = ($newChild && 'props' in $newChild) ? $newChild.props.key : undefined;
        // If a non-key element remains at the same index we preserve it with a virtual `key`
        if ($newChild && !newChildKey) {
          key = `${INDEX_KEY_PREFIX}${i}`;
          // Otherwise, we just remove it
        } else {
          renderWithVirtual(currentEl, $currentChild, undefined, $new, -1);

          return acc;
        }
      }

      // Then we build up info about remaining children
      acc[key] = {
        $element: $currentChild,
        index: currentRemainingIndex++,
        orderKey: 'props' in $currentChild ? $currentChild.props.teactOrderKey : undefined,
      };
      return acc;
    }, {} as Record<string, { $element: VirtualElement; index: number; orderKey?: number }>);

  let newChildren: VirtualElement[] = [];

  let fragmentElements: VirtualElement[] | undefined;
  let fragmentIndex: number | undefined;

  let currentPreservedIndex = 0;

  $new.children.forEach(($newChild, i) => {
    const key = 'props' in $newChild ? $newChild.props.key : `${INDEX_KEY_PREFIX}${i}`;
    const currentChildInfo = remainingByKey[key];

    if (!currentChildInfo) {
      if (!fragmentElements) {
        fragmentElements = [];
        fragmentIndex = i;
      }

      fragmentElements.push($newChild);
      return;
    }

    // This prepends new children to the top
    if (fragmentElements) {
      newChildren = newChildren.concat(renderFragment(fragmentElements, fragmentIndex!, currentEl, $new));
      fragmentElements = undefined;
      fragmentIndex = undefined;
    }

    // Now we check if a preserved node was moved within preserved list
    const newOrderKey = 'props' in $newChild ? $newChild.props.teactOrderKey : undefined;
    // That is indicated by a changed `teactOrderKey` value
    const shouldMoveNode = (
      currentChildInfo.index !== currentPreservedIndex && (!newOrderKey || currentChildInfo.orderKey !== newOrderKey)
    );
    const isMovingDown = shouldMoveNode && currentPreservedIndex > currentChildInfo.index;

    if (!shouldMoveNode || isMovingDown) {
      currentPreservedIndex++;
    }

    const nextSibling = currentEl.childNodes[isMovingDown ? i + 1 : i];
    const options = shouldMoveNode ? (nextSibling ? { nextSibling } : { forceMoveToEnd: true }) : undefined;

    newChildren.push(renderWithVirtual(currentEl, currentChildInfo.$element, $newChild, $new, i, options));
  });

  // This appends new children to the bottom
  if (fragmentElements) {
    newChildren = newChildren.concat(renderFragment(fragmentElements, fragmentIndex!, currentEl, $new));
  }

  return newChildren;
}

function renderFragment(
  elements: VirtualElement[], fragmentIndex: number, parentEl: HTMLElement, $parent: VirtualElementParent,
) {
  const nextSibling = parentEl.childNodes[fragmentIndex];

  if (elements.length === 1) {
    return [renderWithVirtual(parentEl, undefined, elements[0], $parent, fragmentIndex, { nextSibling })];
  }

  const fragment = document.createDocumentFragment();
  const newChildren = elements.map(($element, i) => (
    renderWithVirtual(parentEl, undefined, $element, $parent, fragmentIndex + i, { fragment })
  ));

  insertBefore(parentEl, fragment, nextSibling);

  return newChildren;
}

function setElementRef($element: VirtualElementTag, htmlElement: HTMLElement | undefined) {
  const { ref } = $element.props;

  if (typeof ref === 'object') {
    ref.current = htmlElement;
  } else if (typeof ref === 'function') {
    ref(htmlElement);
  }
}

function processControlled(tag: string, props: AnyLiteral) {
  // TODO Remove after tests
  if (!props.teactExperimentControlled) {
    return;
  }

  const isValueControlled = props.value !== undefined;
  const isCheckedControlled = props.checked !== undefined;
  const isControlled = (isValueControlled || isCheckedControlled) && CONTROLLABLE_TAGS.includes(tag.toUpperCase());
  if (!isControlled) {
    return;
  }

  const {
    value, checked, onInput, onChange,
  } = props;

  props.onChange = undefined;
  props.onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onInput?.(e);
    onChange?.(e);

    if (value !== undefined && value !== e.currentTarget.value) {
      const { selectionStart, selectionEnd } = e.currentTarget;
      const isCaretAtEnd = selectionStart === selectionEnd && selectionEnd === e.currentTarget.value.length;

      e.currentTarget.value = value;

      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        e.currentTarget.setSelectionRange(selectionStart, selectionEnd);

        const selectionState: SelectionState = { selectionStart, selectionEnd, isCaretAtEnd };
        // eslint-disable-next-line no-underscore-dangle
        e.currentTarget.dataset.__teactSelectionState = JSON.stringify(selectionState);
      }
    }

    if (checked !== undefined) {
      e.currentTarget.checked = checked;
    }
  };
}

function processUncontrolledOnMount(element: HTMLElement, props: AnyLiteral) {
  if (!CONTROLLABLE_TAGS.includes(element.tagName)) {
    return;
  }

  if (props.defaultValue) {
    setAttribute(element, 'value', props.defaultValue);
  }

  if (props.defaultChecked) {
    setAttribute(element, 'checked', props.defaultChecked);
  }
}

function updateAttributes($current: VirtualElementTag, $new: VirtualElementTag, element: HTMLElement) {
  processControlled(element.tagName, $new.props);

  const currentEntries = Object.entries($current.props);
  const newEntries = Object.entries($new.props);

  currentEntries.forEach(([key, currentValue]) => {
    const newValue = $new.props[key];

    if (
      currentValue !== undefined
      && (
        newValue === undefined
        || (currentValue !== newValue && key.startsWith('on'))
      )
    ) {
      removeAttribute(element, key, currentValue);
    }
  });

  newEntries.forEach(([key, newValue]) => {
    const currentValue = $current.props[key];

    if (newValue !== undefined && newValue !== currentValue) {
      setAttribute(element, key, newValue);
    }
  });
}

function setAttribute(element: HTMLElement, key: string, value: any) {
  if (key === 'className') {
    updateClassName(element, value);
  } else if (key === 'value') {
    const inputEl = element as HTMLInputElement;

    if (inputEl.value !== value) {
      inputEl.value = value;

      // eslint-disable-next-line no-underscore-dangle
      const selectionStateJson = inputEl.dataset.__teactSelectionState;
      if (selectionStateJson) {
        const { selectionStart, selectionEnd, isCaretAtEnd } = JSON.parse(selectionStateJson) as SelectionState;

        if (isCaretAtEnd) {
          const length = inputEl.value.length;
          inputEl.setSelectionRange(length, length);
        } else if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
          inputEl.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    }
  } else if (key === 'style') {
    element.style.cssText = value;
  } else if (key === 'dangerouslySetInnerHTML') {
    // eslint-disable-next-line no-underscore-dangle
    element.innerHTML = value.__html;
  } else if (key.startsWith('on')) {
    addEventListener(element, key, value, key.endsWith('Capture'));
  } else if (key.startsWith('data-') || key.startsWith('aria-') || HTML_ATTRIBUTES.has(key)) {
    element.setAttribute(key, value);
  } else if (!FILTERED_ATTRIBUTES.has(key)) {
    (element as any)[MAPPED_ATTRIBUTES[key] || key] = value;
  }
}

function removeAttribute(element: HTMLElement, key: string, value: any) {
  if (key === 'className') {
    updateClassName(element, '');
  } else if (key === 'value') {
    (element as HTMLInputElement).value = '';
  } else if (key === 'style') {
    element.style.cssText = '';
  } else if (key === 'dangerouslySetInnerHTML') {
    element.innerHTML = '';
  } else if (key.startsWith('on')) {
    removeEventListener(element, key, value, key.endsWith('Capture'));
  } else if (!FILTERED_ATTRIBUTES.has(key)) {
    element.removeAttribute(key);
  }
}

function updateClassName(element: HTMLElement, value: string) {
  const extra = extraClasses.get(element);
  if (!extra) {
    element.className = value;
    return;
  }

  const extraArray = Array.from(extra);
  if (value) {
    extraArray.push(value);
  }

  element.className = extraArray.join(' ');
}

export function addExtraClass(element: Element, className: string, forceSingle = false) {
  if (!forceSingle) {
    const classNames = className.split(' ');
    if (classNames.length > 1) {
      classNames.forEach((cn) => {
        addExtraClass(element, cn, true);
      });

      return;
    }
  }

  element.classList.add(className);

  const classList = extraClasses.get(element);
  if (classList) {
    classList.add(className);
  } else {
    extraClasses.set(element, new Set([className]));
  }
}

export function removeExtraClass(element: Element, className: string, forceSingle = false) {
  if (!forceSingle) {
    const classNames = className.split(' ');
    if (classNames.length > 1) {
      classNames.forEach((cn) => {
        removeExtraClass(element, cn, true);
      });

      return;
    }
  }

  element.classList.remove(className);

  const classList = extraClasses.get(element);
  if (classList) {
    classList.delete(className);

    if (!classList.size) {
      extraClasses.delete(element);
    }
  }
}

export function toggleExtraClass(element: Element, className: string, force?: boolean, forceSingle = false) {
  if (!forceSingle) {
    const classNames = className.split(' ');
    if (classNames.length > 1) {
      classNames.forEach((cn) => {
        toggleExtraClass(element, cn, force, true);
      });

      return;
    }
  }

  element.classList.toggle(className, force);

  if (element.classList.contains(className)) {
    addExtraClass(element, className);
  } else {
    removeExtraClass(element, className);
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function DEBUG_addToVirtualTreeSize($current: VirtualElementParent | VirtualDomHead) {
  DEBUG_virtualTreeSize += $current.children.length;

  $current.children.forEach(($child) => {
    if (isParentElement($child)) {
      DEBUG_addToVirtualTreeSize($child);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function DEBUG_checkKeyUniqueness(children: VirtualElementChildren) {
  const firstChild = children[0];
  if (firstChild && 'props' in firstChild && firstChild.props.key !== undefined) {
    const keys = children.reduce((acc: any[], child) => {
      if ('props' in child && child.props.key) {
        acc.push(child.props.key);
      }

      return acc;
    }, []);

    if (keys.length !== unique(keys).length) {
      // eslint-disable-next-line no-console
      console.warn('[Teact] Duplicated keys:', keys.filter((e, i, a) => a.indexOf(e) !== i));
      throw new Error('[Teact] Children keys are not unique');
    }
  }
}

const TeactDOM = { render };
export default TeactDOM;
