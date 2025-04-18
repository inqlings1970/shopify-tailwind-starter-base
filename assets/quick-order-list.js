if (!customElements.get('quick-order-list')) {
  customElements.define(
    'quick-order-list',
    class QuickOrderList extends BulkAdd {
      cartUpdateUnsubscriber = undefined;
      hasPendingQuantityUpdate = false;
      constructor() {
        super();
        this.isListInsideModal = this.closest('bulk-modal');

        this.variantItemStatusElement = document.getElementById(
          'shopping-cart-variant-item-status',
        );
        const form = this.querySelector('form');
        this.inputFieldHeight = this.querySelector(
          '.variant-item__quantity-wrapper',
        ).offsetHeight;
        this.isListInsideModal = document.querySelector('.quick-add-bulk');
        this.stickyHeaderElement = document.querySelector('sticky-header');
        if (this.stickyHeaderElement) {
          this.stickyHeader = {
            height: this.stickyHeaderElement.offsetHeight,
            type: `${this.stickyHeaderElement.getAttribute(
              'data-sticky-type',
            )}`,
          };
        }

        if (this.getTotalBar()) {
          this.totalBarPosition =
            window.innerHeight - this.getTotalBar().offsetHeight;

          window.addEventListener('resize', () => {
            this.totalBarPosition =
              window.innerHeight - this.getTotalBar().offsetHeight;
            this.stickyHeader.height = this.stickyHeaderElement
              ? this.stickyHeaderElement.offsetHeight
              : 0;
          });
        }

        const pageParams = new URLSearchParams(window.location.search);
        window.pageNumber = decodeURIComponent(pageParams.get('page') || '');
        form.addEventListener('submit', this.onSubmit.bind(this));
        this.addMultipleDebounce();
      }

      cartUpdateUnsubscriber = undefined;

      onSubmit(event) {
        event.preventDefault();
      }

      connectedCallback() {
        this.cartUpdateUnsubscriber = subscribe(
          PUB_SUB_EVENTS.cartUpdate,
          (event) => {
            const variantIds = [];
            this.querySelectorAll('.variant-item').forEach((item) => {
              variantIds.push(parseInt(item.dataset.variantId));
            });
            if (
              event.source === this.quickOrderListId ||
              !event.cartData.items?.some((element) =>
                variantIds.includes(element.variant_id),
              )
            ) {
              return;
            }
            // If its another section that made the update
            this.refresh().then(() => {
              this.defineInputsAndQuickOrderTable();
              this.addMultipleDebounce();
            });
          },
        );
        this.sectionId = this.dataset.section;
      }

      disconnectedCallback() {
        this.cartUpdateUnsubscriber?.();
      }

      defineInputsAndQuickOrderTable() {
        this.allInputsArray = Array.from(
          this.querySelectorAll('input[type="number"]'),
        );
        this.quickOrderListTable = this.querySelector(
          '.quick-order-list__table',
        );
        this.quickOrderListTable.addEventListener(
          'focusin',
          this.switchVariants.bind(this),
        );
      }

      onChange(event) {
        const inputValue = parseInt(event.target.value);
        this.cleanErrorMessageOnType(event);
        if (inputValue == 0) {
          event.target.setAttribute('value', inputValue);
          this.startQueue(event.target.dataset.index, inputValue);
        } else {
          this.validateQuantity(event);
        }
      }

      cleanErrorMessageOnType(event) {
        const handleKeydown = () => {
          event.target.setCustomValidity(' ');
          event.target.reportValidity();
          event.target.removeEventListener('keydown', handleKeydown);
        };

        event.target.addEventListener('keydown', handleKeydown);
      }

      validateInput(target) {
        const targetValue = parseInt(target.value);
        const targetMin = parseInt(target.dataset.min);
        const targetStep = parseInt(target.step);

        if (target.max) {
          return (
            targetValue == 0 ||
            (targetValue >= targetMin &&
              targetValue <= parseInt(target.max) &&
              targetValue % targetStep == 0)
          );
        } else {
          return (
            targetValue == 0 ||
            (targetValue >= targetMin && targetValue % targetStep == 0)
          );
        }
      }

      refresh() {
        return new Promise((resolve, reject) => {
          fetch(`${this.getSectionsUrl()}?section_id=${this.sectionId}`)
            .then((response) => response.text())
            .then((responseText) => {
              const html = new DOMParser().parseFromString(
                responseText,
                'text/html',
              );
              const sourceQty = html.querySelector(`#${this.quickOrderListId}`);
              if (sourceQty) {
                this.innerHTML = sourceQty.innerHTML;
              }
              resolve();
            })
            .catch((e) => {
              console.error(e);
              reject(e);
            });
        });
      }

      getSectionsToRender() {
        return [
          {
            id: this.quickOrderListId,
            section: document.getElementById(this.quickOrderListId).dataset
              .section,
            selector: `#${this.quickOrderListId} .js-contents`,
          },
          {
            id: 'cart-icon-bubble',
            section: 'cart-icon-bubble',
            selector: '#shopify-section-cart-icon-bubble',
          },
          {
            id: `quick-order-list-live-region-text-${this.dataset.productId}`,
            section: 'cart-live-region-text',
            selector: '.shopify-section',
          },
          {
            id: `quick-order-list-total-${this.dataset.productId}-${this.dataset.section}`,
            section: document.getElementById(this.quickOrderListId).dataset
              .section,
            selector: `#${this.quickOrderListId} .quick-order-list__total`,
          },
          {
            id: 'CartDrawer',
            selector: '.drawer__inner',
            section: 'cart-drawer',
          },
        ];
      }

      addMultipleDebounce() {
        this.querySelectorAll('quantity-input').forEach((qty) => {
          const debouncedOnChange = debounce((event) => {
            this.onChange(event);
          }, 100);
          qty.addEventListener('change', debouncedOnChange.bind(this));
        });
      }

      renderSections(parsedState, ids) {
        this.ids.push(ids);
        const intersection = this.queue.filter((element) =>
          ids.includes(element.id),
        );
        if (intersection.length !== 0) return;

        this.getSectionsToRender().forEach((section) => {
          const sectionElement = document.getElementById(section.id);
          if (
            sectionElement &&
            sectionElement.parentElement &&
            sectionElement.parentElement.classList.contains('drawer')
          ) {
            parsedState.items.length > 0
              ? sectionElement.parentElement.classList.remove('is-empty')
              : sectionElement.parentElement.classList.add('is-empty');
            setTimeout(() => {
              document
                .querySelector('#CartDrawer-Overlay')
                .addEventListener('click', this.cart.close.bind(this.cart));
            });
          }
          const elementToReplace =
            sectionElement && sectionElement.querySelector(section.selector)
              ? sectionElement.querySelector(section.selector)
              : sectionElement;
          if (elementToReplace) {
            if (
              section.selector === `#${this.quickOrderListId} .js-contents` &&
              this.ids.length > 0
            ) {
              this.ids.flat().forEach((i) => {
                elementToReplace.querySelector(`#Variant-${i}`).innerHTML =
                  this.getSectionInnerHTML(
                    parsedState.sections[section.section],
                    `#Variant-${i}`,
                  );
              });
            } else {
              elementToReplace.innerHTML = this.getSectionInnerHTML(
                parsedState.sections[section.section],
                section.selector,
              );
            }
          }
        });
        this.defineInputsAndQuickOrderTable();
        this.addMultipleDebounce();
        this.ids = [];
      }

      getTableHead() {
        return document.querySelector('.quick-order-list__table thead');
      }

      getTotalBar() {
        return this.querySelector('.quick-order-list__total');
      }

      scrollQuickOrderListTable() {
        const inputTopBorder =
          this.variantListInput.getBoundingClientRect().top;
        const inputBottomBorder =
          this.variantListInput.getBoundingClientRect().bottom;

        if (this.isListInsideModal) {
          const totalBarCrossesInput =
            inputBottomBorder > this.getTotalBar().getBoundingClientRect().top;
          const tableHeadCrossesInput =
            inputTopBorder < this.getTableHead().getBoundingClientRect().bottom;

          if (totalBarCrossesInput || tableHeadCrossesInput) {
            this.scrollToCenter(target);
          }
        } else {
          const stickyHeaderBottomBorder =
            this.stickyHeaderElement &&
            this.stickyHeaderElement.getBoundingClientRect().bottom;
          const totalBarCrossesInput =
            inputBottomBorder > this.totalBarPosition;
          const inputOutsideOfViewPort =
            inputBottomBorder < this.inputFieldHeight;
          const stickyHeaderCrossesInput =
            this.stickyHeaderElement &&
            this.stickyHeader.type !== 'on-scroll-up' &&
            this.stickyHeader.height > inputTopBorder;
          const stickyHeaderScrollupCrossesInput =
            this.stickyHeaderElement &&
            this.stickyHeader.type === 'on-scroll-up' &&
            this.stickyHeader.height > inputTopBorder &&
            stickyHeaderBottomBorder > 0;

          if (
            totalBarCrossesInput ||
            inputOutsideOfViewPort ||
            stickyHeaderCrossesInput ||
            stickyHeaderScrollupCrossesInput
          ) {
            this.scrollToCenter(target);
          }
        }
      }

      scrollToCenter() {
        this.variantListInput.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        });
      }

      switchVariants(event) {
        if (event.target.tagName !== 'INPUT') {
          return;
        }

        this.variantListInput = event.target;
        this.variantListInput.select();
        if (this.allInputsArray.length !== 1) {
          this.variantListInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.target.blur();
              if (this.validateInput(e.target)) {
                const currentIndex = this.allInputsArray.indexOf(e.target);
                this.lastKey = e.shiftKey;
                if (!e.shiftKey) {
                  const nextIndex = currentIndex + 1;
                  const nextVariant =
                    this.allInputsArray[nextIndex] || this.allInputsArray[0];
                  nextVariant.select();
                } else {
                  const previousIndex = currentIndex - 1;
                  const previousVariant =
                    this.allInputsArray[previousIndex] ||
                    this.allInputsArray[this.allInputsArray.length - 1];
                  this.lastElement = previousVariant.dataset.index;
                  previousVariant.select();
                }
              }
            }
          });

          this.scrollQuickOrderListTable();
        } else {
          this.variantListInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.target.blur();
            }
          });
        }
      }

      updateMultipleQty(items) {
        this.querySelector(
          '.variant-remove-total .loading__spinner',
        )?.classList.remove('hidden');
        const ids = Object.keys(items);

        const body = JSON.stringify({
          updates: items,
          sections: this.getSectionsToRender().map(
            (section) => section.section,
          ),
          sections_url: this.dataset.url,
        });

        this.updateMessage();
        this.setErrorMessage();

        fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } })
          .then((response) => response.text())
          .then(async (state) => {
            const parsedState = JSON.parse(state);
            this.renderSections(parsedState, ids);
            publish(PUB_SUB_EVENTS.cartUpdate, {
              source: this.quickOrderListId,
              cartData: parsedState,
            });
          })
          .catch((e) => {
            console.error(e);
            this.setErrorMessage(window.cartStrings.error);
          })
          .finally(() => {
            this.querySelector(
              '.variant-remove-total .loading__spinner',
            )?.classList.add('hidden');
            this.requestStarted = false;
          });
      }

      setErrorMessage(message = null) {
        this.errorMessageTemplate =
          this.errorMessageTemplate ??
          document
            .getElementById(
              `QuickOrderListErrorTemplate-${this.dataset.productId}`,
            )
            .cloneNode(true);
        const errorElements = document.querySelectorAll(
          '.quick-order-list-error',
        );

        errorElements.forEach((errorElement) => {
          errorElement.innerHTML = '';
          if (!message) return;
          const updatedMessageElement =
            this.errorMessageTemplate.cloneNode(true);
          updatedMessageElement.content.querySelector(
            '.quick-order-list-error-message',
          ).innerText = message;
          errorElement.appendChild(updatedMessageElement.content);
        });
      }

      updateMessage(quantity = null) {
        const messages = this.querySelectorAll(
          '.quick-order-list__message-text',
        );
        const icons = this.querySelectorAll('.quick-order-list__message-icon');

        if (quantity === null || isNaN(quantity)) {
          messages.forEach((message) => (message.innerHTML = ''));
          icons.forEach((icon) => icon.classList.add('hidden'));
          return;
        }

        const isQuantityNegative = quantity < 0;
        const absQuantity = Math.abs(quantity);

        const textTemplate = isQuantityNegative
          ? absQuantity === 1
            ? window.quickOrderListStrings.itemRemoved
            : window.quickOrderListStrings.itemsRemoved
          : quantity === 1
          ? window.quickOrderListStrings.itemAdded
          : window.quickOrderListStrings.itemsAdded;

        messages.forEach(
          (msg) =>
            (msg.innerHTML = textTemplate.replace('[quantity]', absQuantity)),
        );

        if (!isQuantityNegative) {
          icons.forEach((i) => i.classList.remove('hidden'));
        }
      }

      updateError(updatedValue, id) {
        let message = '';
        if (typeof updatedValue === 'undefined') {
          message = window.cartStrings.error;
        } else {
          message = window.cartStrings.quantityError.replace(
            '[quantity]',
            updatedValue,
          );
        }
        this.updateLiveRegions(id, message);
      }

      updateLiveRegions(id, message) {
        const variantItemErrorDesktop = document.getElementById(
          `Quick-order-list-item-error-desktop-${id}`,
        );
        const variantItemErrorMobile = document.getElementById(
          `Quick-order-list-item-error-mobile-${id}`,
        );
        if (variantItemErrorDesktop) {
          variantItemErrorDesktop.querySelector(
            '.variant-item__error-text',
          ).innerHTML = message;
          variantItemErrorDesktop.closest('tr').classList.remove('hidden');
        }
        if (variantItemErrorMobile)
          variantItemErrorMobile.querySelector(
            '.variant-item__error-text',
          ).innerHTML = message;

        this.querySelector('#shopping-cart-variant-item-status').setAttribute(
          'aria-hidden',
          true,
        );

        const cartStatus = document.getElementById(
          'quick-order-list-live-region-text',
        );
        cartStatus.setAttribute('aria-hidden', false);

        setTimeout(() => {
          cartStatus.setAttribute('aria-hidden', true);
        }, 1000);
      }

      toggleLoading(id, enable) {
        const quickOrderListItems = this.querySelectorAll(
          `#Variant-${id} .loading__spinner`,
        );
        const quickOrderListItem = this.querySelector(`#Variant-${id}`);

        if (enable) {
          quickOrderListItem.classList.add(
            'quick-order-list__container--disabled',
          );
          [...quickOrderListItems].forEach((overlay) =>
            overlay.classList.remove('hidden'),
          );
          this.variantItemStatusElement.setAttribute('aria-hidden', false);
        } else {
          quickOrderListItem.classList.remove(
            'quick-order-list__container--disabled',
          );
          quickOrderListItems.forEach((overlay) =>
            overlay.classList.add('hidden'),
          );
        }
      }
    },
  );
}
