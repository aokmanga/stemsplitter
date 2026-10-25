(() => {
  // node_modules/@tauri-apps/api/tauri.js
  function uid() {
    return window.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  function transformCallback(callback, once2 = false) {
    const identifier = uid();
    const prop = `_${identifier}`;
    Object.defineProperty(window, prop, {
      value: (result) => {
        if (once2) {
          Reflect.deleteProperty(window, prop);
        }
        return callback === null || callback === void 0 ? void 0 : callback(result);
      },
      writable: false,
      configurable: true
    });
    return identifier;
  }
  async function invoke(cmd, args = {}) {
    return new Promise((resolve, reject) => {
      const callback = transformCallback((e) => {
        resolve(e);
        Reflect.deleteProperty(window, `_${error}`);
      }, true);
      const error = transformCallback((e) => {
        reject(e);
        Reflect.deleteProperty(window, `_${callback}`);
      }, true);
      window.__TAURI_IPC__({
        cmd,
        callback,
        error,
        ...args
      });
    });
  }

  // node_modules/@tauri-apps/api/helpers/tauri.js
  async function invokeTauriCommand(command) {
    return invoke("tauri", command);
  }

  // node_modules/@tauri-apps/api/helpers/event.js
  async function _unlisten(event, eventId) {
    return invokeTauriCommand({
      __tauriModule: "Event",
      message: {
        cmd: "unlisten",
        event,
        eventId
      }
    });
  }
  async function emit(event, windowLabel, payload) {
    await invokeTauriCommand({
      __tauriModule: "Event",
      message: {
        cmd: "emit",
        event,
        windowLabel,
        payload
      }
    });
  }
  async function listen(event, windowLabel, handler) {
    return invokeTauriCommand({
      __tauriModule: "Event",
      message: {
        cmd: "listen",
        event,
        windowLabel,
        handler: transformCallback(handler)
      }
    }).then((eventId) => {
      return async () => _unlisten(event, eventId);
    });
  }
  async function once(event, windowLabel, handler) {
    return listen(event, windowLabel, (eventData) => {
      handler(eventData);
      _unlisten(event, eventData.id).catch(() => {
      });
    });
  }

  // node_modules/@tauri-apps/api/event.js
  var TauriEvent;
  (function(TauriEvent2) {
    TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
    TauriEvent2["WINDOW_MOVED"] = "tauri://move";
    TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
    TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
    TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
    TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
    TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
    TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
    TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
    TauriEvent2["WINDOW_FILE_DROP"] = "tauri://file-drop";
    TauriEvent2["WINDOW_FILE_DROP_HOVER"] = "tauri://file-drop-hover";
    TauriEvent2["WINDOW_FILE_DROP_CANCELLED"] = "tauri://file-drop-cancelled";
    TauriEvent2["MENU"] = "tauri://menu";
    TauriEvent2["CHECK_UPDATE"] = "tauri://update";
    TauriEvent2["UPDATE_AVAILABLE"] = "tauri://update-available";
    TauriEvent2["INSTALL_UPDATE"] = "tauri://update-install";
    TauriEvent2["STATUS_UPDATE"] = "tauri://update-status";
    TauriEvent2["DOWNLOAD_PROGRESS"] = "tauri://update-download-progress";
  })(TauriEvent || (TauriEvent = {}));
  async function listen2(event, handler) {
    return listen(event, null, handler);
  }

  // node_modules/@tauri-apps/api/window.js
  var LogicalSize = class {
    constructor(width, height) {
      this.type = "Logical";
      this.width = width;
      this.height = height;
    }
  };
  var PhysicalSize = class {
    constructor(width, height) {
      this.type = "Physical";
      this.width = width;
      this.height = height;
    }
    /**
     * Converts the physical size to a logical one.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const factor = await appWindow.scaleFactor();
     * const size = await appWindow.innerSize();
     * const logical = size.toLogical(factor);
     * ```
     *  */
    toLogical(scaleFactor) {
      return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
    }
  };
  var LogicalPosition = class {
    constructor(x, y) {
      this.type = "Logical";
      this.x = x;
      this.y = y;
    }
  };
  var PhysicalPosition = class {
    constructor(x, y) {
      this.type = "Physical";
      this.x = x;
      this.y = y;
    }
    /**
     * Converts the physical position to a logical one.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const factor = await appWindow.scaleFactor();
     * const position = await appWindow.innerPosition();
     * const logical = position.toLogical(factor);
     * ```
     * */
    toLogical(scaleFactor) {
      return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
    }
  };
  var UserAttentionType;
  (function(UserAttentionType2) {
    UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
    UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
  })(UserAttentionType || (UserAttentionType = {}));
  function getAll() {
    return window.__TAURI_METADATA__.__windows.map((w) => new WebviewWindow(w.label, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    }));
  }
  var localTauriEvents = ["tauri://created", "tauri://error"];
  var WebviewWindowHandle = class {
    constructor(label) {
      this.label = label;
      this.listeners = /* @__PURE__ */ Object.create(null);
    }
    /**
     * Listen to an event emitted by the backend or webview.
     * The event must either be a global event or an event targetting this window.
     *
     * See {@link WebviewWindow.emit | `emit`} for more information.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const unlisten = await appWindow.listen<string>('state-changed', (event) => {
     *   console.log(`Got error: ${payload}`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     */
    async listen(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return Promise.resolve(() => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        });
      }
      return listen(event, this.label, handler);
    }
    /**
     * Listen to an one-off event.
     * See {@link WebviewWindow.listen | `listen`} for more information.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const unlisten = await appWindow.once<null>('initialized', (event) => {
     *   console.log(`Window initialized!`);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param handler Event handler.
     * @returns A promise resolving to a function to unlisten to the event.
     */
    async once(event, handler) {
      if (this._handleTauriEvent(event, handler)) {
        return Promise.resolve(() => {
          const listeners = this.listeners[event];
          listeners.splice(listeners.indexOf(handler), 1);
        });
      }
      return once(event, this.label, handler);
    }
    /**
     * Emits an event to the backend and all Tauri windows.
     * The event will have this window's {@link WebviewWindow.label | label} as {@link Event.windowLabel | source window label}.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.emit('window-loaded', { loggedIn: true, token: 'authToken' });
     * ```
     *
     * This function can also be used to communicate between windows:
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.listen('sync-data', (event) => { });
     *
     * // on another window...
     * import { WebviewWindow } from '@tauri-apps/api/window';
     * const otherWindow = WebviewWindow.getByLabel('other')
     * await otherWindow.emit('sync-data');
     * ```
     *
     * Global listeners are also triggered:
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * import { listen } from '@tauri-apps/api/event';
     * await listen('ping', (event) => { });
     *
     * await appWindow.emit('ping');
     * ```
     *
     * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
     * @param payload Event payload.
     */
    async emit(event, payload) {
      if (localTauriEvents.includes(event)) {
        for (const handler of this.listeners[event] || []) {
          handler({ event, id: -1, windowLabel: this.label, payload });
        }
        return Promise.resolve();
      }
      return emit(event, this.label, payload);
    }
    /** @ignore */
    _handleTauriEvent(event, handler) {
      if (localTauriEvents.includes(event)) {
        if (!(event in this.listeners)) {
          this.listeners[event] = [handler];
        } else {
          this.listeners[event].push(handler);
        }
        return true;
      }
      return false;
    }
  };
  var WindowManager = class extends WebviewWindowHandle {
    // Getters
    /**
     * The scale factor that can be used to map physical pixels to logical pixels.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const factor = await appWindow.scaleFactor();
     * ```
     *
     * @returns The window's monitor scale factor.
     * */
    async scaleFactor() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "scaleFactor"
            }
          }
        }
      });
    }
    /**
     * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const position = await appWindow.innerPosition();
     * ```
     *
     * @returns The window's inner position.
     *  */
    async innerPosition() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "innerPosition"
            }
          }
        }
      }).then(({ x, y }) => new PhysicalPosition(x, y));
    }
    /**
     * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const position = await appWindow.outerPosition();
     * ```
     *
     * @returns The window's outer position.
     *  */
    async outerPosition() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "outerPosition"
            }
          }
        }
      }).then(({ x, y }) => new PhysicalPosition(x, y));
    }
    /**
     * The physical size of the window's client area.
     * The client area is the content of the window, excluding the title bar and borders.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const size = await appWindow.innerSize();
     * ```
     *
     * @returns The window's inner size.
     */
    async innerSize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "innerSize"
            }
          }
        }
      }).then(({ width, height }) => new PhysicalSize(width, height));
    }
    /**
     * The physical size of the entire window.
     * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const size = await appWindow.outerSize();
     * ```
     *
     * @returns The window's outer size.
     */
    async outerSize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "outerSize"
            }
          }
        }
      }).then(({ width, height }) => new PhysicalSize(width, height));
    }
    /**
     * Gets the window's current fullscreen state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const fullscreen = await appWindow.isFullscreen();
     * ```
     *
     * @returns Whether the window is in fullscreen mode or not.
     *  */
    async isFullscreen() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isFullscreen"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current minimized state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const minimized = await appWindow.isMinimized();
     * ```
     *
     * @since 1.3.0
     * */
    async isMinimized() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isMinimized"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current maximized state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const maximized = await appWindow.isMaximized();
     * ```
     *
     * @returns Whether the window is maximized or not.
     * */
    async isMaximized() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isMaximized"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current focus state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const focused = await appWindow.isFocused();
     * ```
     *
     * @returns Whether the window is focused or not.
     *
     * @since 1.4
     * */
    async isFocused() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isFocused"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current decorated state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const decorated = await appWindow.isDecorated();
     * ```
     *
     * @returns Whether the window is decorated or not.
     *  */
    async isDecorated() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isDecorated"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current resizable state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const resizable = await appWindow.isResizable();
     * ```
     *
     * @returns Whether the window is resizable or not.
     *  */
    async isResizable() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isResizable"
            }
          }
        }
      });
    }
    /**
     * Gets the window’s native maximize button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const maximizable = await appWindow.isMaximizable();
     * ```
     *
     * @returns Whether the window's native maximize button is enabled or not.
     *  */
    async isMaximizable() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isMaximizable"
            }
          }
        }
      });
    }
    /**
     * Gets the window’s native minimize button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const minimizable = await appWindow.isMinimizable();
     * ```
     *
     * @returns Whether the window's native minimize button is enabled or not.
     *  */
    async isMinimizable() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isMinimizable"
            }
          }
        }
      });
    }
    /**
     * Gets the window’s native close button state.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const closable = await appWindow.isClosable();
     * ```
     *
     * @returns Whether the window's native close button is enabled or not.
     *  */
    async isClosable() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isClosable"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current visible state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const visible = await appWindow.isVisible();
     * ```
     *
     * @returns Whether the window is visible or not.
     *  */
    async isVisible() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "isVisible"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current title.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const title = await appWindow.title();
     * ```
     *
     * @since 1.3.0
     * */
    async title() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "title"
            }
          }
        }
      });
    }
    /**
     * Gets the window's current theme.
     *
     * #### Platform-specific
     *
     * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * const theme = await appWindow.theme();
     * ```
     *
     * @returns The window theme.
     * */
    async theme() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "theme"
            }
          }
        }
      });
    }
    // Setters
    /**
     * Centers the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.center();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async center() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "center"
            }
          }
        }
      });
    }
    /**
     *  Requests user attention to the window, this has no effect if the application
     * is already focused. How requesting for user attention manifests is platform dependent,
     * see `UserAttentionType` for details.
     *
     * Providing `null` will unset the request for user attention. Unsetting the request for
     * user attention might not be done automatically by the WM when the window receives input.
     *
     * #### Platform-specific
     *
     * - **macOS:** `null` has no effect.
     * - **Linux:** Urgency levels have the same effect.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.requestUserAttention();
     * ```
     *
     * @param requestType
     * @returns A promise indicating the success or failure of the operation.
     */
    async requestUserAttention(requestType) {
      let requestType_ = null;
      if (requestType) {
        if (requestType === UserAttentionType.Critical) {
          requestType_ = { type: "Critical" };
        } else {
          requestType_ = { type: "Informational" };
        }
      }
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "requestUserAttention",
              payload: requestType_
            }
          }
        }
      });
    }
    /**
     * Updates the window resizable flag.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setResizable(false);
     * ```
     *
     * @param resizable
     * @returns A promise indicating the success or failure of the operation.
     */
    async setResizable(resizable) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setResizable",
              payload: resizable
            }
          }
        }
      });
    }
    /**
     * Sets whether the window's native maximize button is enabled or not.
     * If resizable is set to false, this setting is ignored.
     *
     * #### Platform-specific
     *
     * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setMaximizable(false);
     * ```
     *
     * @param maximizable
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMaximizable(maximizable) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setMaximizable",
              payload: maximizable
            }
          }
        }
      });
    }
    /**
     * Sets whether the window's native minimize button is enabled or not.
     *
     * #### Platform-specific
     *
     * - **Linux / iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setMinimizable(false);
     * ```
     *
     * @param minimizable
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMinimizable(minimizable) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setMinimizable",
              payload: minimizable
            }
          }
        }
      });
    }
    /**
     * Sets whether the window's native close button is enabled or not.
     *
     * #### Platform-specific
     *
     * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
     * - **iOS / Android:** Unsupported.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setClosable(false);
     * ```
     *
     * @param closable
     * @returns A promise indicating the success or failure of the operation.
     */
    async setClosable(closable) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setClosable",
              payload: closable
            }
          }
        }
      });
    }
    /**
     * Sets the window title.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setTitle('Tauri');
     * ```
     *
     * @param title The new title
     * @returns A promise indicating the success or failure of the operation.
     */
    async setTitle(title) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setTitle",
              payload: title
            }
          }
        }
      });
    }
    /**
     * Maximizes the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.maximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async maximize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "maximize"
            }
          }
        }
      });
    }
    /**
     * Unmaximizes the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.unmaximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async unmaximize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "unmaximize"
            }
          }
        }
      });
    }
    /**
     * Toggles the window maximized state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.toggleMaximize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async toggleMaximize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "toggleMaximize"
            }
          }
        }
      });
    }
    /**
     * Minimizes the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.minimize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async minimize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "minimize"
            }
          }
        }
      });
    }
    /**
     * Unminimizes the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.unminimize();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async unminimize() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "unminimize"
            }
          }
        }
      });
    }
    /**
     * Sets the window visibility to true.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.show();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async show() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "show"
            }
          }
        }
      });
    }
    /**
     * Sets the window visibility to false.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.hide();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async hide() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "hide"
            }
          }
        }
      });
    }
    /**
     * Closes the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.close();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async close() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "close"
            }
          }
        }
      });
    }
    /**
     * Whether the window should have borders and bars.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setDecorations(false);
     * ```
     *
     * @param decorations Whether the window should have borders and bars.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setDecorations(decorations) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setDecorations",
              payload: decorations
            }
          }
        }
      });
    }
    /**
     * Whether the window should always be on top of other windows.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setAlwaysOnTop(true);
     * ```
     *
     * @param alwaysOnTop Whether the window should always be on top of other windows or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setAlwaysOnTop(alwaysOnTop) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setAlwaysOnTop",
              payload: alwaysOnTop
            }
          }
        }
      });
    }
    /**
     * Prevents the window contents from being captured by other apps.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setContentProtected(true);
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     *
     * @since 1.2.0
     */
    async setContentProtected(protected_) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setContentProtected",
              payload: protected_
            }
          }
        }
      });
    }
    /**
     * Resizes the window with a new inner size.
     * @example
     * ```typescript
     * import { appWindow, LogicalSize } from '@tauri-apps/api/window';
     * await appWindow.setSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSize(size) {
      if (!size || size.type !== "Logical" && size.type !== "Physical") {
        throw new Error("the `size` argument must be either a LogicalSize or a PhysicalSize instance");
      }
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setSize",
              payload: {
                type: size.type,
                data: {
                  width: size.width,
                  height: size.height
                }
              }
            }
          }
        }
      });
    }
    /**
     * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
     * @example
     * ```typescript
     * import { appWindow, PhysicalSize } from '@tauri-apps/api/window';
     * await appWindow.setMinSize(new PhysicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMinSize(size) {
      if (size && size.type !== "Logical" && size.type !== "Physical") {
        throw new Error("the `size` argument must be either a LogicalSize or a PhysicalSize instance");
      }
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setMinSize",
              payload: size ? {
                type: size.type,
                data: {
                  width: size.width,
                  height: size.height
                }
              } : null
            }
          }
        }
      });
    }
    /**
     * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
     * @example
     * ```typescript
     * import { appWindow, LogicalSize } from '@tauri-apps/api/window';
     * await appWindow.setMaxSize(new LogicalSize(600, 500));
     * ```
     *
     * @param size The logical or physical inner size, or `null` to unset the constraint.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setMaxSize(size) {
      if (size && size.type !== "Logical" && size.type !== "Physical") {
        throw new Error("the `size` argument must be either a LogicalSize or a PhysicalSize instance");
      }
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setMaxSize",
              payload: size ? {
                type: size.type,
                data: {
                  width: size.width,
                  height: size.height
                }
              } : null
            }
          }
        }
      });
    }
    /**
     * Sets the window outer position.
     * @example
     * ```typescript
     * import { appWindow, LogicalPosition } from '@tauri-apps/api/window';
     * await appWindow.setPosition(new LogicalPosition(600, 500));
     * ```
     *
     * @param position The new position, in logical or physical pixels.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setPosition(position) {
      if (!position || position.type !== "Logical" && position.type !== "Physical") {
        throw new Error("the `position` argument must be either a LogicalPosition or a PhysicalPosition instance");
      }
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setPosition",
              payload: {
                type: position.type,
                data: {
                  x: position.x,
                  y: position.y
                }
              }
            }
          }
        }
      });
    }
    /**
     * Sets the window fullscreen state.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setFullscreen(true);
     * ```
     *
     * @param fullscreen Whether the window should go to fullscreen or not.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFullscreen(fullscreen) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setFullscreen",
              payload: fullscreen
            }
          }
        }
      });
    }
    /**
     * Bring the window to front and focus.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setFocus();
     * ```
     *
     * @returns A promise indicating the success or failure of the operation.
     */
    async setFocus() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setFocus"
            }
          }
        }
      });
    }
    /**
     * Sets the window icon.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setIcon('/tauri/awesome.png');
     * ```
     *
     * Note that you need the `icon-ico` or `icon-png` Cargo features to use this API.
     * To enable it, change your Cargo.toml file:
     * ```toml
     * [dependencies]
     * tauri = { version = "...", features = ["...", "icon-png"] }
     * ```
     *
     * @param icon Icon bytes or path to the icon file.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setIcon(icon) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setIcon",
              payload: {
                // correctly serialize Uint8Arrays
                icon: typeof icon === "string" ? icon : Array.from(icon)
              }
            }
          }
        }
      });
    }
    /**
     * Whether the window icon should be hidden from the taskbar or not.
     *
     * #### Platform-specific
     *
     * - **macOS:** Unsupported.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setSkipTaskbar(true);
     * ```
     *
     * @param skip true to hide window icon, false to show it.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setSkipTaskbar(skip) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setSkipTaskbar",
              payload: skip
            }
          }
        }
      });
    }
    /**
     * Grabs the cursor, preventing it from leaving the window.
     *
     * There's no guarantee that the cursor will be hidden. You should
     * hide it by yourself if you want so.
     *
     * #### Platform-specific
     *
     * - **Linux:** Unsupported.
     * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setCursorGrab(true);
     * ```
     *
     * @param grab `true` to grab the cursor icon, `false` to release it.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorGrab(grab) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setCursorGrab",
              payload: grab
            }
          }
        }
      });
    }
    /**
     * Modifies the cursor's visibility.
     *
     * #### Platform-specific
     *
     * - **Windows:** The cursor is only hidden within the confines of the window.
     * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
     *   outside of the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setCursorVisible(false);
     * ```
     *
     * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorVisible(visible) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setCursorVisible",
              payload: visible
            }
          }
        }
      });
    }
    /**
     * Modifies the cursor icon of the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setCursorIcon('help');
     * ```
     *
     * @param icon The new cursor icon.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorIcon(icon) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setCursorIcon",
              payload: icon
            }
          }
        }
      });
    }
    /**
     * Changes the position of the cursor in window coordinates.
     * @example
     * ```typescript
     * import { appWindow, LogicalPosition } from '@tauri-apps/api/window';
     * await appWindow.setCursorPosition(new LogicalPosition(600, 300));
     * ```
     *
     * @param position The new cursor position.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setCursorPosition(position) {
      if (!position || position.type !== "Logical" && position.type !== "Physical") {
        throw new Error("the `position` argument must be either a LogicalPosition or a PhysicalPosition instance");
      }
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setCursorPosition",
              payload: {
                type: position.type,
                data: {
                  x: position.x,
                  y: position.y
                }
              }
            }
          }
        }
      });
    }
    /**
     * Changes the cursor events behavior.
     *
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.setIgnoreCursorEvents(true);
     * ```
     *
     * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
     * @returns A promise indicating the success or failure of the operation.
     */
    async setIgnoreCursorEvents(ignore) {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "setIgnoreCursorEvents",
              payload: ignore
            }
          }
        }
      });
    }
    /**
     * Starts dragging the window.
     * @example
     * ```typescript
     * import { appWindow } from '@tauri-apps/api/window';
     * await appWindow.startDragging();
     * ```
     *
     * @return A promise indicating the success or failure of the operation.
     */
    async startDragging() {
      return invokeTauriCommand({
        __tauriModule: "Window",
        message: {
          cmd: "manage",
          data: {
            label: this.label,
            cmd: {
              type: "startDragging"
            }
          }
        }
      });
    }
    // Listeners
    /**
     * Listen to window resize.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onResized(({ payload: size }) => {
     *  console.log('Window resized', size);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onResized(handler) {
      return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
        e.payload = mapPhysicalSize(e.payload);
        handler(e);
      });
    }
    /**
     * Listen to window move.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onMoved(({ payload: position }) => {
     *  console.log('Window moved', position);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onMoved(handler) {
      return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
        e.payload = mapPhysicalPosition(e.payload);
        handler(e);
      });
    }
    /**
     * Listen to window close requested. Emitted when the user requests to closes the window.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * import { confirm } from '@tauri-apps/api/dialog';
     * const unlisten = await appWindow.onCloseRequested(async (event) => {
     *   const confirmed = await confirm('Are you sure?');
     *   if (!confirmed) {
     *     // user did not confirm closing the window; let's prevent it
     *     event.preventDefault();
     *   }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    /* eslint-disable @typescript-eslint/promise-function-async */
    async onCloseRequested(handler) {
      return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, (event) => {
        const evt = new CloseRequestedEvent(event);
        void Promise.resolve(handler(evt)).then(() => {
          if (!evt.isPreventDefault()) {
            return this.close();
          }
        });
      });
    }
    /* eslint-enable */
    /**
     * Listen to window focus change.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
     *  console.log('Focus changed, window is focused? ' + focused);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onFocusChanged(handler) {
      const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event) => {
        handler({ ...event, payload: true });
      });
      const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event) => {
        handler({ ...event, payload: false });
      });
      return () => {
        unlistenFocus();
        unlistenBlur();
      };
    }
    /**
     * Listen to window scale change. Emitted when the window's scale factor has changed.
     * The following user actions can cause DPI changes:
     * - Changing the display's resolution.
     * - Changing the display's scale factor (e.g. in Control Panel on Windows).
     * - Moving the window to a display with a different scale factor.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onScaleChanged(({ payload }) => {
     *  console.log('Scale changed', payload.scaleFactor, payload.size);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onScaleChanged(handler) {
      return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
    }
    /**
     * Listen to the window menu item click. The payload is the item id.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onMenuClicked(({ payload: menuId }) => {
     *  console.log('Menu clicked: ' + menuId);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onMenuClicked(handler) {
      return this.listen(TauriEvent.MENU, handler);
    }
    /**
     * Listen to a file drop event.
     * The listener is triggered when the user hovers the selected files on the window,
     * drops the files or cancels the operation.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onFileDropEvent((event) => {
     *  if (event.payload.type === 'hover') {
     *    console.log('User hovering', event.payload.paths);
     *  } else if (event.payload.type === 'drop') {
     *    console.log('User dropped', event.payload.paths);
     *  } else {
     *    console.log('File drop cancelled');
     *  }
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onFileDropEvent(handler) {
      const unlistenFileDrop = await this.listen(TauriEvent.WINDOW_FILE_DROP, (event) => {
        handler({ ...event, payload: { type: "drop", paths: event.payload } });
      });
      const unlistenFileHover = await this.listen(TauriEvent.WINDOW_FILE_DROP_HOVER, (event) => {
        handler({ ...event, payload: { type: "hover", paths: event.payload } });
      });
      const unlistenCancel = await this.listen(TauriEvent.WINDOW_FILE_DROP_CANCELLED, (event) => {
        handler({ ...event, payload: { type: "cancel" } });
      });
      return () => {
        unlistenFileDrop();
        unlistenFileHover();
        unlistenCancel();
      };
    }
    /**
     * Listen to the system theme change.
     *
     * @example
     * ```typescript
     * import { appWindow } from "@tauri-apps/api/window";
     * const unlisten = await appWindow.onThemeChanged(({ payload: theme }) => {
     *  console.log('New theme: ' + theme);
     * });
     *
     * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
     * unlisten();
     * ```
     *
     * @returns A promise resolving to a function to unlisten to the event.
     * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
     *
     * @since 1.0.2
     */
    async onThemeChanged(handler) {
      return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
    }
  };
  var CloseRequestedEvent = class {
    constructor(event) {
      this._preventDefault = false;
      this.event = event.event;
      this.windowLabel = event.windowLabel;
      this.id = event.id;
    }
    preventDefault() {
      this._preventDefault = true;
    }
    isPreventDefault() {
      return this._preventDefault;
    }
  };
  var WebviewWindow = class _WebviewWindow extends WindowManager {
    /**
     * Creates a new WebviewWindow.
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/window';
     * const webview = new WebviewWindow('my-label', {
     *   url: 'https://github.com/tauri-apps/tauri'
     * });
     * webview.once('tauri://created', function () {
     *  // webview window successfully created
     * });
     * webview.once('tauri://error', function (e) {
     *  // an error happened creating the webview window
     * });
     * ```
     *
     * * @param label The unique webview window label. Must be alphanumeric: `a-zA-Z-/:_`.
     * @returns The WebviewWindow instance to communicate with the webview.
     */
    constructor(label, options = {}) {
      super(label);
      if (!(options === null || options === void 0 ? void 0 : options.skip)) {
        invokeTauriCommand({
          __tauriModule: "Window",
          message: {
            cmd: "createWebview",
            data: {
              options: {
                label,
                ...options
              }
            }
          }
        }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
      }
    }
    /**
     * Gets the WebviewWindow for the webview associated with the given label.
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/window';
     * const mainWindow = WebviewWindow.getByLabel('main');
     * ```
     *
     * @param label The webview window label.
     * @returns The WebviewWindow instance to communicate with the webview or null if the webview doesn't exist.
     */
    static getByLabel(label) {
      if (getAll().some((w) => w.label === label)) {
        return new _WebviewWindow(label, { skip: true });
      }
      return null;
    }
    /**
     *  Gets the focused window.
     * @example
     * ```typescript
     * import { WebviewWindow } from '@tauri-apps/api/window';
     * const focusedWindow = WebviewWindow.getFocusedWindow();
     * ```
     *
     * @returns The WebviewWindow instance to communicate with the webview or `undefined` if there is not any focused window.
     *
     * @since 1.4
     */
    static async getFocusedWindow() {
      for (const w of getAll()) {
        if (await w.isFocused()) {
          return w;
        }
      }
      return null;
    }
  };
  var appWindow;
  if ("__TAURI_METADATA__" in window) {
    appWindow = new WebviewWindow(window.__TAURI_METADATA__.__currentWindow.label, {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    });
  } else {
    console.warn(`Could not find "window.__TAURI_METADATA__". The "appWindow" value will reference the "main" window label.
Note that this is not an issue if running this frontend on a browser instead of a Tauri window.`);
    appWindow = new WebviewWindow("main", {
      // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
      skip: true
    });
  }
  function mapPhysicalPosition(m) {
    return new PhysicalPosition(m.x, m.y);
  }
  function mapPhysicalSize(m) {
    return new PhysicalSize(m.width, m.height);
  }

  // node_modules/soundtouchjs/dist/soundtouch.js
  var FifoSampleBuffer = class {
    constructor() {
      this._vector = new Float32Array();
      this._position = 0;
      this._frameCount = 0;
    }
    get vector() {
      return this._vector;
    }
    get position() {
      return this._position;
    }
    get startIndex() {
      return this._position * 2;
    }
    get frameCount() {
      return this._frameCount;
    }
    get endIndex() {
      return (this._position + this._frameCount) * 2;
    }
    clear() {
      this._vector.fill(0);
      this._position = 0;
      this._frameCount = 0;
    }
    put(numFrames) {
      this._frameCount += numFrames;
    }
    putSamples(samples, position, numFrames = 0) {
      position = position || 0;
      const sourceOffset = position * 2;
      if (!(numFrames >= 0)) {
        numFrames = (samples.length - sourceOffset) / 2;
      }
      const numSamples = numFrames * 2;
      this.ensureCapacity(numFrames + this._frameCount);
      const destOffset = this.endIndex;
      this.vector.set(samples.subarray(sourceOffset, sourceOffset + numSamples), destOffset);
      this._frameCount += numFrames;
    }
    putBuffer(buffer, position, numFrames = 0) {
      position = position || 0;
      if (!(numFrames >= 0)) {
        numFrames = buffer.frameCount - position;
      }
      this.putSamples(buffer.vector, buffer.position + position, numFrames);
    }
    receive(numFrames) {
      if (!(numFrames >= 0) || numFrames > this._frameCount) {
        numFrames = this.frameCount;
      }
      this._frameCount -= numFrames;
      this._position += numFrames;
    }
    receiveSamples(output, numFrames = 0) {
      const numSamples = numFrames * 2;
      const sourceOffset = this.startIndex;
      output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
      this.receive(numFrames);
    }
    extract(output, position = 0, numFrames = 0) {
      const sourceOffset = this.startIndex + position * 2;
      const numSamples = numFrames * 2;
      output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
    }
    ensureCapacity(numFrames = 0) {
      const minLength = parseInt(numFrames * 2);
      if (this._vector.length < minLength) {
        const newVector = new Float32Array(minLength);
        newVector.set(this._vector.subarray(this.startIndex, this.endIndex));
        this._vector = newVector;
        this._position = 0;
      } else {
        this.rewind();
      }
    }
    ensureAdditionalCapacity(numFrames = 0) {
      this.ensureCapacity(this._frameCount + numFrames);
    }
    rewind() {
      if (this._position > 0) {
        this._vector.set(this._vector.subarray(this.startIndex, this.endIndex));
        this._position = 0;
      }
    }
  };
  var AbstractFifoSamplePipe = class {
    constructor(createBuffers) {
      if (createBuffers) {
        this._inputBuffer = new FifoSampleBuffer();
        this._outputBuffer = new FifoSampleBuffer();
      } else {
        this._inputBuffer = this._outputBuffer = null;
      }
    }
    get inputBuffer() {
      return this._inputBuffer;
    }
    set inputBuffer(inputBuffer) {
      this._inputBuffer = inputBuffer;
    }
    get outputBuffer() {
      return this._outputBuffer;
    }
    set outputBuffer(outputBuffer) {
      this._outputBuffer = outputBuffer;
    }
    clear() {
      this._inputBuffer.clear();
      this._outputBuffer.clear();
    }
  };
  var RateTransposer = class _RateTransposer extends AbstractFifoSamplePipe {
    constructor(createBuffers) {
      super(createBuffers);
      this.reset();
      this._rate = 1;
    }
    set rate(rate) {
      this._rate = rate;
    }
    reset() {
      this.slopeCount = 0;
      this.prevSampleL = 0;
      this.prevSampleR = 0;
    }
    clear() {
      super.clear();
      this.reset();
    }
    clone() {
      const result = new _RateTransposer();
      result.rate = this._rate;
      return result;
    }
    process() {
      const numFrames = this._inputBuffer.frameCount;
      this._outputBuffer.ensureAdditionalCapacity(numFrames / this._rate + 1);
      const numFramesOutput = this.transpose(numFrames);
      this._inputBuffer.receive();
      this._outputBuffer.put(numFramesOutput);
    }
    transpose(numFrames = 0) {
      if (numFrames === 0) {
        return 0;
      }
      const src = this._inputBuffer.vector;
      const srcOffset = this._inputBuffer.startIndex;
      const dest = this._outputBuffer.vector;
      const destOffset = this._outputBuffer.endIndex;
      let used = 0;
      let i = 0;
      while (this.slopeCount < 1) {
        dest[destOffset + 2 * i] = (1 - this.slopeCount) * this.prevSampleL + this.slopeCount * src[srcOffset];
        dest[destOffset + 2 * i + 1] = (1 - this.slopeCount) * this.prevSampleR + this.slopeCount * src[srcOffset + 1];
        i = i + 1;
        this.slopeCount += this._rate;
      }
      this.slopeCount -= 1;
      if (numFrames !== 1) {
        out: while (true) {
          while (this.slopeCount > 1) {
            this.slopeCount -= 1;
            used = used + 1;
            if (used >= numFrames - 1) {
              break out;
            }
          }
          const srcIndex = srcOffset + 2 * used;
          dest[destOffset + 2 * i] = (1 - this.slopeCount) * src[srcIndex] + this.slopeCount * src[srcIndex + 2];
          dest[destOffset + 2 * i + 1] = (1 - this.slopeCount) * src[srcIndex + 1] + this.slopeCount * src[srcIndex + 3];
          i = i + 1;
          this.slopeCount += this._rate;
        }
      }
      this.prevSampleL = src[srcOffset + 2 * numFrames - 2];
      this.prevSampleR = src[srcOffset + 2 * numFrames - 1];
      return i;
    }
  };
  var FilterSupport = class {
    constructor(pipe) {
      this._pipe = pipe;
    }
    get pipe() {
      return this._pipe;
    }
    get inputBuffer() {
      return this._pipe.inputBuffer;
    }
    get outputBuffer() {
      return this._pipe.outputBuffer;
    }
    fillInputBuffer() {
      throw new Error("fillInputBuffer() not overridden");
    }
    fillOutputBuffer(numFrames = 0) {
      while (this.outputBuffer.frameCount < numFrames) {
        const numInputFrames = 8192 * 2 - this.inputBuffer.frameCount;
        this.fillInputBuffer(numInputFrames);
        if (this.inputBuffer.frameCount < 8192 * 2) {
          break;
        }
        this._pipe.process();
      }
    }
    clear() {
      this._pipe.clear();
    }
  };
  var noop = function() {
    return;
  };
  var SimpleFilter = class extends FilterSupport {
    constructor(sourceSound, pipe, callback = noop) {
      super(pipe);
      this.callback = callback;
      this.sourceSound = sourceSound;
      this.historyBufferSize = 22050;
      this._sourcePosition = 0;
      this.outputBufferPosition = 0;
      this._position = 0;
    }
    get position() {
      return this._position;
    }
    set position(position) {
      if (position > this._position) {
        throw new RangeError("New position may not be greater than current position");
      }
      const newOutputBufferPosition = this.outputBufferPosition - (this._position - position);
      if (newOutputBufferPosition < 0) {
        throw new RangeError("New position falls outside of history buffer");
      }
      this.outputBufferPosition = newOutputBufferPosition;
      this._position = position;
    }
    get sourcePosition() {
      return this._sourcePosition;
    }
    set sourcePosition(sourcePosition) {
      this.clear();
      this._sourcePosition = sourcePosition;
    }
    onEnd() {
      this.callback();
    }
    fillInputBuffer(numFrames = 0) {
      const samples = new Float32Array(numFrames * 2);
      const numFramesExtracted = this.sourceSound.extract(samples, numFrames, this._sourcePosition);
      this._sourcePosition += numFramesExtracted;
      this.inputBuffer.putSamples(samples, 0, numFramesExtracted);
    }
    extract(target, numFrames = 0) {
      this.fillOutputBuffer(this.outputBufferPosition + numFrames);
      const numFramesExtracted = Math.min(numFrames, this.outputBuffer.frameCount - this.outputBufferPosition);
      this.outputBuffer.extract(target, this.outputBufferPosition, numFramesExtracted);
      const currentFrames = this.outputBufferPosition + numFramesExtracted;
      this.outputBufferPosition = Math.min(this.historyBufferSize, currentFrames);
      this.outputBuffer.receive(Math.max(currentFrames - this.historyBufferSize, 0));
      this._position += numFramesExtracted;
      return numFramesExtracted;
    }
    handleSampleData(event) {
      this.extract(event.data, 4096);
    }
    clear() {
      super.clear();
      this.outputBufferPosition = 0;
    }
  };
  var USE_AUTO_SEQUENCE_LEN = 0;
  var DEFAULT_SEQUENCE_MS = USE_AUTO_SEQUENCE_LEN;
  var USE_AUTO_SEEKWINDOW_LEN = 0;
  var DEFAULT_SEEKWINDOW_MS = USE_AUTO_SEEKWINDOW_LEN;
  var DEFAULT_OVERLAP_MS = 8;
  var _SCAN_OFFSETS = [[124, 186, 248, 310, 372, 434, 496, 558, 620, 682, 744, 806, 868, 930, 992, 1054, 1116, 1178, 1240, 1302, 1364, 1426, 1488, 0], [-100, -75, -50, -25, 25, 50, 75, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [-20, -15, -10, -5, 5, 10, 15, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [-4, -3, -2, -1, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  var AUTOSEQ_TEMPO_LOW = 0.25;
  var AUTOSEQ_TEMPO_TOP = 4;
  var AUTOSEQ_AT_MIN = 125;
  var AUTOSEQ_AT_MAX = 50;
  var AUTOSEQ_K = (AUTOSEQ_AT_MAX - AUTOSEQ_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
  var AUTOSEQ_C = AUTOSEQ_AT_MIN - AUTOSEQ_K * AUTOSEQ_TEMPO_LOW;
  var AUTOSEEK_AT_MIN = 25;
  var AUTOSEEK_AT_MAX = 15;
  var AUTOSEEK_K = (AUTOSEEK_AT_MAX - AUTOSEEK_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
  var AUTOSEEK_C = AUTOSEEK_AT_MIN - AUTOSEEK_K * AUTOSEQ_TEMPO_LOW;
  var Stretch = class _Stretch extends AbstractFifoSamplePipe {
    constructor(createBuffers) {
      super(createBuffers);
      this._quickSeek = true;
      this.midBufferDirty = false;
      this.midBuffer = null;
      this.overlapLength = 0;
      this.autoSeqSetting = true;
      this.autoSeekSetting = true;
      this._tempo = 1;
      this.setParameters(44100, DEFAULT_SEQUENCE_MS, DEFAULT_SEEKWINDOW_MS, DEFAULT_OVERLAP_MS);
    }
    clear() {
      super.clear();
      this.clearMidBuffer();
    }
    clearMidBuffer() {
      this.midBufferDirty = false;
      this.midBuffer = null;
      if (this.refMidBuffer) {
        this.refMidBuffer.fill(0);
      }
      this.skipFract = 0;
    }
    setParameters(sampleRate, sequenceMs, seekWindowMs, overlapMs) {
      if (sampleRate > 0) {
        this.sampleRate = sampleRate;
      }
      if (overlapMs > 0) {
        this.overlapMs = overlapMs;
      }
      if (sequenceMs > 0) {
        this.sequenceMs = sequenceMs;
        this.autoSeqSetting = false;
      } else {
        this.autoSeqSetting = true;
      }
      if (seekWindowMs > 0) {
        this.seekWindowMs = seekWindowMs;
        this.autoSeekSetting = false;
      } else {
        this.autoSeekSetting = true;
      }
      this.calculateSequenceParameters();
      this.calculateOverlapLength(this.overlapMs);
      this.tempo = this._tempo;
    }
    set tempo(newTempo) {
      let intskip;
      this._tempo = newTempo;
      this.calculateSequenceParameters();
      this.nominalSkip = this._tempo * (this.seekWindowLength - this.overlapLength);
      this.skipFract = 0;
      intskip = Math.floor(this.nominalSkip + 0.5);
      this.sampleReq = Math.max(intskip + this.overlapLength, this.seekWindowLength) + this.seekLength;
    }
    get tempo() {
      return this._tempo;
    }
    get inputChunkSize() {
      return this.sampleReq;
    }
    get outputChunkSize() {
      return this.overlapLength + Math.max(0, this.seekWindowLength - 2 * this.overlapLength);
    }
    calculateOverlapLength(overlapInMsec = 0) {
      let newOvl;
      newOvl = this.sampleRate * overlapInMsec / 1e3;
      newOvl = newOvl < 16 ? 16 : newOvl;
      newOvl -= newOvl % 8;
      this.overlapLength = newOvl;
      this.refMidBuffer = new Float32Array(this.overlapLength * 2);
      this.midBuffer = new Float32Array(this.overlapLength * 2);
    }
    checkLimits(x, mi, ma) {
      return x < mi ? mi : x > ma ? ma : x;
    }
    calculateSequenceParameters() {
      let seq;
      let seek;
      if (this.autoSeqSetting) {
        seq = AUTOSEQ_C + AUTOSEQ_K * this._tempo;
        seq = this.checkLimits(seq, AUTOSEQ_AT_MAX, AUTOSEQ_AT_MIN);
        this.sequenceMs = Math.floor(seq + 0.5);
      }
      if (this.autoSeekSetting) {
        seek = AUTOSEEK_C + AUTOSEEK_K * this._tempo;
        seek = this.checkLimits(seek, AUTOSEEK_AT_MAX, AUTOSEEK_AT_MIN);
        this.seekWindowMs = Math.floor(seek + 0.5);
      }
      this.seekWindowLength = Math.floor(this.sampleRate * this.sequenceMs / 1e3);
      this.seekLength = Math.floor(this.sampleRate * this.seekWindowMs / 1e3);
    }
    set quickSeek(enable) {
      this._quickSeek = enable;
    }
    clone() {
      const result = new _Stretch();
      result.tempo = this._tempo;
      result.setParameters(this.sampleRate, this.sequenceMs, this.seekWindowMs, this.overlapMs);
      return result;
    }
    seekBestOverlapPosition() {
      return this._quickSeek ? this.seekBestOverlapPositionStereoQuick() : this.seekBestOverlapPositionStereo();
    }
    seekBestOverlapPositionStereo() {
      let bestOffset;
      let bestCorrelation;
      let correlation;
      let i = 0;
      this.preCalculateCorrelationReferenceStereo();
      bestOffset = 0;
      bestCorrelation = Number.MIN_VALUE;
      for (; i < this.seekLength; i = i + 1) {
        correlation = this.calculateCrossCorrelationStereo(2 * i, this.refMidBuffer);
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = i;
        }
      }
      return bestOffset;
    }
    seekBestOverlapPositionStereoQuick() {
      let bestOffset;
      let bestCorrelation;
      let correlation;
      let scanCount = 0;
      let correlationOffset;
      let tempOffset;
      this.preCalculateCorrelationReferenceStereo();
      bestCorrelation = Number.MIN_VALUE;
      bestOffset = 0;
      correlationOffset = 0;
      tempOffset = 0;
      for (; scanCount < 4; scanCount = scanCount + 1) {
        let j = 0;
        while (_SCAN_OFFSETS[scanCount][j]) {
          tempOffset = correlationOffset + _SCAN_OFFSETS[scanCount][j];
          if (tempOffset >= this.seekLength) {
            break;
          }
          correlation = this.calculateCrossCorrelationStereo(2 * tempOffset, this.refMidBuffer);
          if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = tempOffset;
          }
          j = j + 1;
        }
        correlationOffset = bestOffset;
      }
      return bestOffset;
    }
    preCalculateCorrelationReferenceStereo() {
      let i = 0;
      let context;
      let temp;
      for (; i < this.overlapLength; i = i + 1) {
        temp = i * (this.overlapLength - i);
        context = i * 2;
        this.refMidBuffer[context] = this.midBuffer[context] * temp;
        this.refMidBuffer[context + 1] = this.midBuffer[context + 1] * temp;
      }
    }
    calculateCrossCorrelationStereo(mixingPosition, compare) {
      const mixing = this._inputBuffer.vector;
      mixingPosition += this._inputBuffer.startIndex;
      let correlation = 0;
      let i = 2;
      const calcLength = 2 * this.overlapLength;
      let mixingOffset;
      for (; i < calcLength; i = i + 2) {
        mixingOffset = i + mixingPosition;
        correlation += mixing[mixingOffset] * compare[i] + mixing[mixingOffset + 1] * compare[i + 1];
      }
      return correlation;
    }
    overlap(overlapPosition) {
      this.overlapStereo(2 * overlapPosition);
    }
    overlapStereo(inputPosition) {
      const input = this._inputBuffer.vector;
      inputPosition += this._inputBuffer.startIndex;
      const output = this._outputBuffer.vector;
      const outputPosition = this._outputBuffer.endIndex;
      let i = 0;
      let context;
      let tempFrame;
      const frameScale = 1 / this.overlapLength;
      let fi;
      let inputOffset;
      let outputOffset;
      for (; i < this.overlapLength; i = i + 1) {
        tempFrame = (this.overlapLength - i) * frameScale;
        fi = i * frameScale;
        context = 2 * i;
        inputOffset = context + inputPosition;
        outputOffset = context + outputPosition;
        output[outputOffset + 0] = input[inputOffset + 0] * fi + this.midBuffer[context + 0] * tempFrame;
        output[outputOffset + 1] = input[inputOffset + 1] * fi + this.midBuffer[context + 1] * tempFrame;
      }
    }
    process() {
      let offset;
      let temp;
      let overlapSkip;
      if (this.midBuffer === null) {
        if (this._inputBuffer.frameCount < this.overlapLength) {
          return;
        }
        this.midBuffer = new Float32Array(this.overlapLength * 2);
        this._inputBuffer.receiveSamples(this.midBuffer, this.overlapLength);
      }
      while (this._inputBuffer.frameCount >= this.sampleReq) {
        offset = this.seekBestOverlapPosition();
        this._outputBuffer.ensureAdditionalCapacity(this.overlapLength);
        this.overlap(Math.floor(offset));
        this._outputBuffer.put(this.overlapLength);
        temp = this.seekWindowLength - 2 * this.overlapLength;
        if (temp > 0) {
          this._outputBuffer.putBuffer(this._inputBuffer, offset + this.overlapLength, temp);
        }
        const start = this._inputBuffer.startIndex + 2 * (offset + this.seekWindowLength - this.overlapLength);
        this.midBuffer.set(this._inputBuffer.vector.subarray(start, start + 2 * this.overlapLength));
        this.skipFract += this.nominalSkip;
        overlapSkip = Math.floor(this.skipFract);
        this.skipFract -= overlapSkip;
        this._inputBuffer.receive(overlapSkip);
      }
    }
  };
  var testFloatEqual = function(a, b) {
    return (a > b ? a - b : b - a) > 1e-10;
  };
  var SoundTouch = class _SoundTouch {
    constructor() {
      this.transposer = new RateTransposer(false);
      this.stretch = new Stretch(false);
      this._inputBuffer = new FifoSampleBuffer();
      this._intermediateBuffer = new FifoSampleBuffer();
      this._outputBuffer = new FifoSampleBuffer();
      this._rate = 0;
      this._tempo = 0;
      this.virtualPitch = 1;
      this.virtualRate = 1;
      this.virtualTempo = 1;
      this.calculateEffectiveRateAndTempo();
    }
    clear() {
      this.transposer.clear();
      this.stretch.clear();
    }
    clone() {
      const result = new _SoundTouch();
      result.rate = this.rate;
      result.tempo = this.tempo;
      return result;
    }
    get rate() {
      return this._rate;
    }
    set rate(rate) {
      this.virtualRate = rate;
      this.calculateEffectiveRateAndTempo();
    }
    set rateChange(rateChange) {
      this._rate = 1 + 0.01 * rateChange;
    }
    get tempo() {
      return this._tempo;
    }
    set tempo(tempo) {
      this.virtualTempo = tempo;
      this.calculateEffectiveRateAndTempo();
    }
    set tempoChange(tempoChange) {
      this.tempo = 1 + 0.01 * tempoChange;
    }
    set pitch(pitch) {
      this.virtualPitch = pitch;
      this.calculateEffectiveRateAndTempo();
    }
    set pitchOctaves(pitchOctaves) {
      this.pitch = Math.exp(0.69314718056 * pitchOctaves);
      this.calculateEffectiveRateAndTempo();
    }
    set pitchSemitones(pitchSemitones) {
      this.pitchOctaves = pitchSemitones / 12;
    }
    get inputBuffer() {
      return this._inputBuffer;
    }
    get outputBuffer() {
      return this._outputBuffer;
    }
    calculateEffectiveRateAndTempo() {
      const previousTempo = this._tempo;
      const previousRate = this._rate;
      this._tempo = this.virtualTempo / this.virtualPitch;
      this._rate = this.virtualRate * this.virtualPitch;
      if (testFloatEqual(this._tempo, previousTempo)) {
        this.stretch.tempo = this._tempo;
      }
      if (testFloatEqual(this._rate, previousRate)) {
        this.transposer.rate = this._rate;
      }
      if (this._rate > 1) {
        if (this._outputBuffer != this.transposer.outputBuffer) {
          this.stretch.inputBuffer = this._inputBuffer;
          this.stretch.outputBuffer = this._intermediateBuffer;
          this.transposer.inputBuffer = this._intermediateBuffer;
          this.transposer.outputBuffer = this._outputBuffer;
        }
      } else {
        if (this._outputBuffer != this.stretch.outputBuffer) {
          this.transposer.inputBuffer = this._inputBuffer;
          this.transposer.outputBuffer = this._intermediateBuffer;
          this.stretch.inputBuffer = this._intermediateBuffer;
          this.stretch.outputBuffer = this._outputBuffer;
        }
      }
    }
    process() {
      if (this._rate > 1) {
        this.stretch.process();
        this.transposer.process();
      } else {
        this.transposer.process();
        this.stretch.process();
      }
    }
  };
  var WebAudioBufferSource = class {
    constructor(buffer) {
      this.buffer = buffer;
      this._position = 0;
    }
    get dualChannel() {
      return this.buffer.numberOfChannels > 1;
    }
    get position() {
      return this._position;
    }
    set position(value) {
      this._position = value;
    }
    extract(target, numFrames = 0, position = 0) {
      this.position = position;
      let left = this.buffer.getChannelData(0);
      let right = this.dualChannel ? this.buffer.getChannelData(1) : this.buffer.getChannelData(0);
      let i = 0;
      for (; i < numFrames; i++) {
        target[i * 2] = left[i + position];
        target[i * 2 + 1] = right[i + position];
      }
      return Math.min(numFrames, left.length - position);
    }
  };

  // src/main.js
  window._invoke = invoke;
  window._listen = listen2;
  window._appWindow = appWindow;
  window._stretch = (buf, tempo, ctx) => {
    const st = new SoundTouch();
    st.tempo = tempo;
    const f = new SimpleFilter(new WebAudioBufferSource(buf), st);
    const len = Math.ceil(buf.length / tempo) + 16384;
    const out = ctx.createBuffer(2, len, buf.sampleRate);
    const L = out.getChannelData(0), R = out.getChannelData(1);
    const tmp = new Float32Array(16384);
    let pos = 0, got;
    while (pos < len - 8192 && (got = f.extract(tmp, 8192)) > 0) {
      for (let i = 0; i < got; i++) {
        L[pos + i] = tmp[2 * i];
        R[pos + i] = tmp[2 * i + 1];
      }
      pos += got;
    }
    return out;
  };
  window._stretchAsync = (buf, tempo, ctx) => {
    const w = new Worker("worker-bundle.js");
    const L = buf.getChannelData(0).slice();
    const R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
    const promise = new Promise((resolve, reject) => {
      w.onmessage = (e) => {
        const out = ctx.createBuffer(2, e.data.len, buf.sampleRate);
        out.copyToChannel(e.data.L, 0);
        out.copyToChannel(e.data.R, 1);
        w.terminate();
        resolve(out);
      };
      w.onerror = (err) => {
        w.terminate();
        reject(err);
      };
    });
    w.postMessage({ L, R, tempo }, [L.buffer, R.buffer]);
    return { promise, cancel: () => w.terminate() };
  };
})();
