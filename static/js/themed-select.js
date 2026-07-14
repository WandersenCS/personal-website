(function () {
  "use strict";

  var useCustomSelect = /Firefox\//.test(window.navigator.userAgent);
  var measurementContext = document.createElement("canvas").getContext("2d");
  var openControl = null;
  var nextId = 0;

  function pixelValue(value) {
    return Number.parseFloat(value) || 0;
  }

  function normalizeExporterWidth(select) {
    if (!select.closest("[data-cv-export]")) {
      return null;
    }

    if (select.dataset.themedSelectWidth) {
      return Number(select.dataset.themedSelectWidth);
    }

    var style = window.getComputedStyle(select);
    var fontSize = pixelValue(style.fontSize) || 16;
    var letterSpacing = pixelValue(style.letterSpacing);
    var textWidth = 0;

    if (measurementContext) {
      measurementContext.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
      Array.prototype.slice.call(select.options).forEach(function (option) {
        var text = option.textContent.trim();
        var width = measurementContext.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
        textWidth = Math.max(textWidth, width);
      });
    }

    var width = Math.ceil(
      textWidth +
      pixelValue(style.paddingLeft) +
      pixelValue(style.paddingRight) +
      pixelValue(style.borderLeftWidth) +
      pixelValue(style.borderRightWidth) +
      fontSize * 1.5
    );

    select.dataset.themedSelectWidth = String(width);
    select.style.boxSizing = "border-box";
    select.style.width = width + "px";
    return width;
  }

  function selectLabel(select) {
    if (select.getAttribute("aria-label")) {
      return select.getAttribute("aria-label");
    }

    var label = select.closest("label");
    var labelText = label ? label.querySelector(":scope > span") : null;
    return labelText ? labelText.textContent.trim() : "Select option";
  }

  function closeControl(control, restoreFocus) {
    if (!control) {
      return;
    }

    control.list.hidden = true;
    control.button.setAttribute("aria-expanded", "false");
    control.button.classList.remove("themed-select__button--open");
    if (openControl === control) {
      openControl = null;
    }
    if (restoreFocus) {
      control.button.focus();
    }
  }

  function positionList(control) {
    var spacing = 4;
    var buttonStyle = window.getComputedStyle(control.button);
    var buttonBox = control.button.getBoundingClientRect();
    var listBox;
    var left;
    var top;

    control.list.style.fontFamily = buttonStyle.fontFamily;
    control.list.style.fontSize = buttonStyle.fontSize;
    control.list.style.fontStyle = buttonStyle.fontStyle;
    control.list.style.fontWeight = buttonStyle.fontWeight;
    control.list.style.letterSpacing = buttonStyle.letterSpacing;
    control.list.style.lineHeight = buttonStyle.lineHeight;
    control.list.style.minWidth = buttonBox.width + "px";
    control.list.style.left = "0px";
    control.list.style.top = buttonBox.bottom + spacing + "px";
    listBox = control.list.getBoundingClientRect();
    left = Math.min(buttonBox.left, window.innerWidth - listBox.width - spacing);
    left = Math.max(spacing, left);
    top = buttonBox.bottom + spacing;

    if (top + listBox.height > window.innerHeight - spacing) {
      top = Math.max(spacing, buttonBox.top - listBox.height - spacing);
    }

    control.list.style.left = left + "px";
    control.list.style.top = top + "px";
  }

  function optionButtons(control) {
    return Array.prototype.slice.call(control.list.querySelectorAll(".themed-select__option:not(:disabled)"));
  }

  function focusRelativeOption(control, direction) {
    var options = optionButtons(control);
    var current = options.indexOf(document.activeElement);
    var selected = options.findIndex(function (option) {
      return option.getAttribute("aria-selected") === "true";
    });
    var start = current >= 0 ? current : selected;
    var next = Math.max(0, Math.min(options.length - 1, start + direction));

    if (options[next]) {
      options[next].focus();
    }
  }

  function open(control, direction) {
    if (control.select.disabled) {
      return;
    }
    if (openControl && openControl !== control) {
      closeControl(openControl, false);
    }

    control.list.hidden = false;
    control.button.setAttribute("aria-expanded", "true");
    control.button.classList.add("themed-select__button--open");
    openControl = control;
    positionList(control);

    var options = optionButtons(control);
    var selected = options.find(function (option) {
      return option.getAttribute("aria-selected") === "true";
    });
    var target = direction < 0 ? options[options.length - 1] : selected || options[0];
    if (target) {
      target.focus();
    }
  }

  function choose(control, index) {
    var changed = control.select.selectedIndex !== index;
    control.select.selectedIndex = index;
    refresh(control);
    closeControl(control, true);

    if (changed) {
      control.select.dispatchEvent(new Event("input", { bubbles: true }));
      control.select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function refresh(control) {
    var selected = control.select.options[control.select.selectedIndex];
    control.button.disabled = control.select.disabled;
    control.button.querySelector("span").textContent = selected ? selected.textContent.trim() : "";
    control.list.textContent = "";

    Array.prototype.slice.call(control.select.options).forEach(function (option, index) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "themed-select__option";
      item.disabled = option.disabled;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", option.selected ? "true" : "false");
      item.classList.toggle("themed-select__option--selected", option.selected);
      item.textContent = option.textContent.trim();
      item.addEventListener("click", function () {
        choose(control, index);
      });
      control.list.appendChild(item);
    });
  }

  function enhance(select) {
    var normalizedWidth = normalizeExporterWidth(select);

    if (!useCustomSelect) {
      return;
    }

    if (select.dataset.themedSelect === "true") {
      return;
    }

    nextId += 1;
    var wrapper = document.createElement("span");
    var button = document.createElement("button");
    var value = document.createElement("span");
    var list = document.createElement("div");
    var control = {
      button: button,
      list: list,
      select: select,
      wrapper: wrapper
    };

    select.dataset.themedSelect = "true";
    select.classList.add("themed-select__native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    wrapper.className = "themed-select";
    if (normalizedWidth) {
      wrapper.style.width = normalizedWidth + "px";
    }
    button.type = "button";
    button.className = "themed-select__button";
    button.setAttribute("aria-label", selectLabel(select));
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "themed-select-list-" + nextId);
    button.appendChild(value);

    list.id = "themed-select-list-" + nextId;
    list.className = "themed-select__list";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(button);
    document.body.appendChild(list);

    button.addEventListener("click", function () {
      if (list.hidden) {
        open(control, 1);
      } else {
        closeControl(control, false);
      }
    });
    button.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open(control, event.key === "ArrowUp" ? -1 : 1);
      }
    });
    list.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeControl(control, true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        focusRelativeOption(control, event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        var options = optionButtons(control);
        var target = event.key === "Home" ? options[0] : options[options.length - 1];
        if (target) {
          target.focus();
        }
      }
    });
    select.addEventListener("change", function () {
      refresh(control);
    });

    select._themedSelectControl = control;
    refresh(control);
  }

  function enhanceWithin(root) {
    if (root.matches && root.matches("select")) {
      enhance(root);
    }
    if (root.querySelectorAll) {
      Array.prototype.slice.call(root.querySelectorAll("select")).forEach(enhance);
    }
  }

  document.addEventListener("click", function (event) {
    if (openControl && !openControl.wrapper.contains(event.target) && !openControl.list.contains(event.target)) {
      closeControl(openControl, false);
    }
  });
  window.addEventListener("resize", function () {
    closeControl(openControl, false);
  });
  window.addEventListener("scroll", function (event) {
    if (openControl && !openControl.list.contains(event.target)) {
      closeControl(openControl, false);
    }
  }, true);

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      Array.prototype.slice.call(mutation.addedNodes).forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          enhanceWithin(node);
        }
      });
      if (mutation.target.matches && mutation.target.matches("select") && mutation.target._themedSelectControl) {
        refresh(mutation.target._themedSelectControl);
      }
    });
  });

  enhanceWithin(document);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["disabled"],
    childList: true,
    subtree: true
  });
})();
