(function () {
  var panel = document.querySelector("[data-cv-export]");
  var openButton = document.querySelector("[data-cv-export-open]");

  if (!panel || !openButton) {
    return;
  }

  var rowsContainer = panel.querySelector("[data-cv-export-options]");
  var status = panel.querySelector("[data-cv-export-status]");
  var printButton = panel.querySelector("[data-cv-export-print]");
  var targetSelect = panel.querySelector("[data-cv-export-target]");
  var themeSelect = panel.querySelector("[data-cv-export-theme]");
  var profilePlacementSelect = panel.querySelector("[data-cv-export-profile-placement]");
  var profileImageSizeSelect = panel.querySelector("[data-cv-export-profile-image-size]");
  var showProfileLinksCheckbox = panel.querySelector("[data-cv-export-show-profile-links]");
  var scaleFillCheckbox = panel.querySelector("[data-cv-export-scale-fill]");
  var documentRoot = document.querySelector("[data-cv-export-document]");
  var closeButtons = Array.prototype.slice.call(panel.querySelectorAll("[data-cv-export-close]"));
  var printPage = null;
  var draggedSection = null;
  var minPrintScale = 0.88;
  var maxPrintScale = 1.12;
  var scaleFitSafety = 24;

  if (!rowsContainer || !status || !printButton || !targetSelect || !themeSelect || !profilePlacementSelect || !profileImageSizeSelect || !showProfileLinksCheckbox || !scaleFillCheckbox || !documentRoot) {
    return;
  }

  var sections = Array.prototype.slice.call(documentRoot.querySelectorAll(".cv-page__content h2")).map(function (heading) {
    var list = heading.nextElementSibling;
    if (!list || !list.classList.contains("jr__list")) {
      return null;
    }

    return {
      control: null,
      enabled: true,
      heading: heading,
      rows: Array.prototype.slice.call(list.querySelectorAll(".jr__item")),
      title: cleanText(heading)
    };
  }).filter(function (section) {
    return section && section.rows.length;
  });

  function textFrom(element, selector) {
    var match = element.querySelector(selector);
    return match ? match.textContent.trim().replace(/\s+/g, " ") : "";
  }

  function cleanText(element) {
    var clone = element.cloneNode(true);
    Array.prototype.slice.call(clone.querySelectorAll(".post-heading__anchor")).forEach(function (anchor) {
      anchor.remove();
    });
    return clone.textContent.trim().replace(/\s+/g, " ");
  }

  function sectionHeading(row) {
    var list = row.closest(".jr__list");
    var current = list ? list.previousElementSibling : null;

    while (current) {
      if (/^h[1-6]$/i.test(current.tagName)) {
        return current;
      }
      current = current.previousElementSibling;
    }

    return null;
  }

  function rowTitle(row) {
    var title =
      textFrom(row, ".jr-work__position") ||
      textFrom(row, ".jr-education__area") ||
      textFrom(row, ".jr-volunteer__position") ||
      textFrom(row, ".jr-skills__item > p") ||
      textFrom(row, ".jr-languages__item") ||
      textFrom(row, ".jr-projects__name") ||
      textFrom(row, ".jr-interests__item") ||
      row.textContent.trim();

    return title.replace(/\s+/g, " ").slice(0, 120);
  }

  function sectionContains(list, className) {
    return list && list.classList.contains(className);
  }

  function defaultPlacement(row) {
    var heading = sectionHeading(row);
    var list = heading ? heading.nextElementSibling : null;
    return sectionContains(list, "jr-skills__list") ||
      sectionContains(list, "jr-languages__list") ||
      sectionContains(list, "jr-interests__list")
      ? "side"
      : "main";
  }

  function closePanel() {
    panel.hidden = true;
    document.documentElement.classList.remove("cv-export-filtering");
    document.documentElement.classList.remove("cv-export-target-one");
    removePrintPage();
  }

  function openPanel() {
    panel.hidden = false;
    update();
  }

  function removePrintPage() {
    if (printPage) {
      printPage.remove();
      printPage = null;
    }
    document.documentElement.classList.remove("cv-export-printing");
  }

  function cloneHeading(heading) {
    var clone = heading.cloneNode(true);
    Array.prototype.slice.call(clone.querySelectorAll(".post-heading__anchor")).forEach(function (anchor) {
      anchor.remove();
    });
    return clone;
  }

  function cloneSelectedSection(section, placement) {
    if (!section.enabled) {
      return null;
    }

    var list = section.heading ? section.heading.nextElementSibling : null;
    if (!list || !list.classList.contains("jr__list")) {
      return null;
    }

    var clone = list.cloneNode(true);
    var selectedCount = 0;

    Array.prototype.slice.call(clone.querySelectorAll(".jr__item")).forEach(function (row) {
      if (row.classList.contains("cv-export-hidden") || row.dataset.cvExportPlacement !== placement) {
        row.remove();
      } else {
        selectedCount += 1;
      }
    });

    return selectedCount ? clone : null;
  }

  function appendSection(target, section, placement) {
    var sectionClone = cloneSelectedSection(section, placement);
    if (!sectionClone) {
      return false;
    }

    target.appendChild(cloneHeading(section.heading));
    target.appendChild(sectionClone);
    return true;
  }

  function profileLinkText(href) {
    return href.replace(/^mailto:/, "");
  }

  function addProfileLinks(bioClone) {
    if (!showProfileLinksCheckbox.checked) {
      return;
    }

    Array.prototype.slice.call(bioClone.querySelectorAll(".jr-basics__profile a[href]")).forEach(function (link) {
      var existing = link.querySelector(".jr-basics__profile-username");
      if (existing) {
        return;
      }

      var text = document.createElement("span");
      text.className = "cv-export-profile-link";
      text.textContent = profileLinkText(link.getAttribute("href"));
      link.querySelector(".jr-basics__profile-item").appendChild(text);
    });
  }

  function buildPrintPage(measureOnly) {
    removePrintPage();

    var page = document.createElement("section");
    page.className = "cv-export-print-page";
    page.style.setProperty("--cv-export-scale", "1");
    page.style.setProperty("--cv-export-main-scale", "1");
    page.style.setProperty("--cv-export-side-scale", "1");
    if (measureOnly) {
      page.classList.add("cv-export-measure");
    }

    var main = document.createElement("div");
    main.className = "cv-export-print-main";

    var side = document.createElement("aside");
    side.className = "cv-export-print-side";

    var title = documentRoot.querySelector(".cv-page__content h1");
    if (title) {
      main.appendChild(title.cloneNode(true));
    }

    var bio = document.querySelector(".bio");
    if (bio) {
      var bioClone = bio.cloneNode(true);
      bioClone.classList.add("cv-export-print-profile");
      bioClone.classList.add("cv-export-image-" + profileImageSizeSelect.value);
      addProfileLinks(bioClone);
      (profilePlacementSelect.value === "main" ? main : side).appendChild(bioClone);
    }

    sections.forEach(function (section) {
      appendSection(main, section, "main");
      appendSection(side, section, "side");
    });

    page.appendChild(main);
    page.appendChild(side);
    document.body.appendChild(page);
    printPage = page;

    return page;
  }

  function measurePages() {
    var page = buildPrintPage(true);
    var scale = printScaleForPage(page);
    setPrintScales(page, scale);
    var pages = measuredPageCount(page, scaleFitSafety);
    removePrintPage();
    return {
      pages: pages,
      scale: scale
    };
  }

  function printScaleForPage(page) {
    if (!scaleFillCheckbox.checked) {
      return {
        main: 1,
        side: 1
      };
    }

    setPrintScales(page, {
      main: 1,
      side: 1
    });

    var pages = measuredPageCount(page);
    var target = targetSelect.value ? Number(targetSelect.value) : null;

    if (!target && pages > 1) {
      return {
        main: 1,
        side: 1
      };
    }

    return {
      main: verifiedColumnScale(page.querySelector(".cv-export-print-main"), target || 1),
      side: verifiedColumnScale(page.querySelector(".cv-export-print-side"), target || 1)
    };
  }

  function setPrintScales(page, scale) {
    page.style.setProperty("--cv-export-main-scale", String(scale.main));
    page.style.setProperty("--cv-export-side-scale", String(scale.side));
  }

  function columnScaleProperty(column) {
    return column.classList.contains("cv-export-print-side") ? "--cv-export-side-scale" : "--cv-export-main-scale";
  }

  function verifiedColumnScale(column, targetPages) {
    var page = column.closest(".cv-export-print-page");
    var property = columnScaleProperty(column);
    var capacity = columnCapacity(page);
    var contentHeight = columnContentHeight(column);
    var idealScale = (capacity * targetPages) / Math.max(contentHeight, 1);
    var lower = targetPages ? minPrintScale : 1;
    var upper = Math.min(maxPrintScale, Math.max(lower, idealScale));
    var best = lower;

    page.style.setProperty(property, String(lower));
    if (columnPageCount(column, scaleFitSafety) > targetPages) {
      return lower;
    }

    for (var index = 0; index < 8; index += 1) {
      var next = (lower + upper) / 2;
      page.style.setProperty(property, String(next));

      if (columnPageCount(column, scaleFitSafety) <= targetPages) {
        best = next;
        lower = next;
      } else {
        upper = next;
      }
    }

    return best;
  }

  function printScale() {
    var page = buildPrintPage(true);
    var scale = printScaleForPage(page);
    removePrintPage();
    return scale;
  }

  function verticalPadding(element) {
    var style = window.getComputedStyle(element);
    return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  }

  function columnCapacity(page) {
    var columns = page.querySelectorAll(".cv-export-print-main, .cv-export-print-side");
    var padding = 0;

    Array.prototype.slice.call(columns).forEach(function (column) {
      padding = Math.max(padding, verticalPadding(column));
    });

    return Math.max(1, printablePageHeight() - padding);
  }

  function columnContentHeight(column) {
    var style = window.getComputedStyle(column);
    var columnTop = column.getBoundingClientRect().top + parseFloat(style.paddingTop);
    var bottom = columnTop;

    Array.prototype.slice.call(column.children).forEach(function (child) {
      var childStyle = window.getComputedStyle(child);
      var childBox = child.getBoundingClientRect();
      bottom = Math.max(bottom, childBox.bottom + parseFloat(childStyle.marginBottom));
    });

    return Math.max(0, bottom - columnTop);
  }

  function tallestColumnContentHeight(page) {
    var columns = page.querySelectorAll(".cv-export-print-main, .cv-export-print-side");
    var height = 0;

    Array.prototype.slice.call(columns).forEach(function (column) {
      height = Math.max(height, columnContentHeight(column));
    });

    return height;
  }

  function columnPageCount(column, safety) {
    var tolerance = typeof safety === "number" ? -safety : 12;
    return Math.max(1, Math.ceil((columnContentHeight(column) - tolerance) / columnCapacity(column.closest(".cv-export-print-page"))));
  }

  function measuredPageCount(page, safety) {
    var tolerance = typeof safety === "number" ? -safety : 12;
    return Math.max(1, Math.ceil((tallestColumnContentHeight(page) - tolerance) / columnCapacity(page)));
  }

  function printablePageHeight() {
    var ruler = document.createElement("div");
    ruler.style.height = "297mm";
    ruler.style.left = "-9999px";
    ruler.style.position = "absolute";
    ruler.style.top = "0";
    document.body.appendChild(ruler);
    var height = ruler.getBoundingClientRect().height;
    ruler.remove();
    return height;
  }

  function updateThemeClass() {
    document.documentElement.classList.toggle("cv-export-print-dark", themeSelect.value === "dark");
    document.documentElement.classList.toggle("cv-export-print-light", themeSelect.value !== "dark");
  }

  function scaleNote(scale) {
    if (!scaleFillCheckbox.checked || (scale.main === 1 && scale.side === 1)) {
      return "";
    }

    if (Math.round(scale.main * 100) === Math.round(scale.side * 100)) {
      return " Auto-fit: " + Math.round(scale.main * 100) + "%.";
    }

    return " Auto-fit: main " + Math.round(scale.main * 100) + "%, sidebar " + Math.round(scale.side * 100) + "%.";
  }

  function update() {
    document.documentElement.classList.add("cv-export-filtering");
    document.documentElement.classList.toggle("cv-export-target-one", targetSelect.value === "1");
    updateThemeClass();

    var estimate = measurePages();
    var pages = estimate.pages;
    var target = targetSelect.value ? Number(targetSelect.value) : null;
    var estimateText = "Estimated content: " + pages + " page" + (pages === 1 ? "." : "s.") + scaleNote(estimate.scale);

    if (target && pages > target) {
      status.textContent = estimateText + " Warning: selected content exceeds the " + target + "-page target.";
      status.classList.add("cv-export__status--warning");
    } else {
      status.textContent = estimateText;
      status.classList.remove("cv-export__status--warning");
    }

    return pages;
  }

  function moveSectionTo(section, targetSection, afterTarget) {
    var index = sections.indexOf(section);
    var targetIndex = sections.indexOf(targetSection);

    if (index < 0 || targetIndex < 0 || section === targetSection) {
      return;
    }

    sections.splice(index, 1);
    if (index < targetIndex) {
      targetIndex -= 1;
    }
    sections.splice(targetIndex + (afterTarget ? 1 : 0), 0, section);
    renderSectionControls();
    update();
  }

  function renderSectionControls() {
    rowsContainer.textContent = "";

    sections.forEach(function (section) {
      section.control.classList.toggle("cv-export__section--dragging", section === draggedSection);
      section.control.classList.toggle("cv-export__section--disabled", !section.enabled);
      rowsContainer.appendChild(section.control);
    });
  }

  var rowIndex = 0;

  sections.forEach(function (section) {
    var sectionControl = document.createElement("section");
    sectionControl.className = "cv-export__section";

    var sectionHeader = document.createElement("div");
    sectionHeader.className = "cv-export__section-header";

    var sectionCheckbox = document.createElement("input");
    sectionCheckbox.type = "checkbox";
    sectionCheckbox.checked = true;
    sectionCheckbox.setAttribute("aria-label", "Include " + section.title);

    var sectionTitleText = document.createElement("span");
    sectionTitleText.className = "cv-export__section-title";
    sectionTitleText.textContent = section.title;

    var sectionRows = document.createElement("div");
    sectionRows.className = "cv-export__section-rows";

    section.rows.forEach(function (row) {
      var id = "cv-export-row-" + rowIndex;
      var placement = defaultPlacement(row);
      rowIndex += 1;
      row.classList.remove("cv-export-hidden");
      row.dataset.cvExportPlacement = placement;

      var rowControl = document.createElement("div");
      rowControl.className = "cv-export__row";

      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.id = id;

      var label = document.createElement("label");
      label.htmlFor = id;

      var text = document.createElement("span");
      text.textContent = rowTitle(row);
      label.appendChild(text);

      var placementSelect = document.createElement("select");
      placementSelect.setAttribute("aria-label", "PDF column for " + rowTitle(row));

      var mainOption = document.createElement("option");
      mainOption.value = "main";
      mainOption.textContent = "Main";

      var sideOption = document.createElement("option");
      sideOption.value = "side";
      sideOption.textContent = "Sidebar";

      placementSelect.appendChild(mainOption);
      placementSelect.appendChild(sideOption);
      placementSelect.value = placement;

      checkbox.addEventListener("change", function () {
        row.classList.toggle("cv-export-hidden", !checkbox.checked);
        update();
      });

      placementSelect.addEventListener("change", function () {
        row.dataset.cvExportPlacement = placementSelect.value;
        update();
      });

      rowControl.appendChild(checkbox);
      rowControl.appendChild(label);
      rowControl.appendChild(placementSelect);
      sectionRows.appendChild(rowControl);
    });

    sectionCheckbox.addEventListener("change", function () {
      section.enabled = sectionCheckbox.checked;
      Array.prototype.slice.call(sectionRows.querySelectorAll("input, select")).forEach(function (control) {
        control.disabled = !section.enabled;
      });
      renderSectionControls();
      update();
    });

    sectionControl.draggable = true;
    sectionControl.addEventListener("dragstart", function (event) {
      if (/^(input|select|button|textarea|label)$/i.test(event.target.tagName)) {
        event.preventDefault();
        return;
      }

      draggedSection = section;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", section.title);
      sectionControl.classList.add("cv-export__section--dragging");
    });

    sectionControl.addEventListener("dragend", function () {
      draggedSection = null;
      Array.prototype.slice.call(rowsContainer.querySelectorAll(".cv-export__section")).forEach(function (control) {
        control.classList.remove("cv-export__section--dragging");
        control.classList.remove("cv-export__section--drop-before");
        control.classList.remove("cv-export__section--drop-after");
      });
    });

    sectionControl.addEventListener("dragover", function (event) {
      if (!draggedSection || draggedSection === section) {
        return;
      }

      var box = sectionControl.getBoundingClientRect();
      var afterTarget = event.clientY > box.top + box.height / 2;
      event.preventDefault();
      sectionControl.classList.toggle("cv-export__section--drop-before", !afterTarget);
      sectionControl.classList.toggle("cv-export__section--drop-after", afterTarget);
    });

    sectionControl.addEventListener("dragleave", function () {
      sectionControl.classList.remove("cv-export__section--drop-before");
      sectionControl.classList.remove("cv-export__section--drop-after");
    });

    sectionControl.addEventListener("drop", function (event) {
      if (!draggedSection) {
        return;
      }

      var box = sectionControl.getBoundingClientRect();
      var afterTarget = event.clientY > box.top + box.height / 2;
      event.preventDefault();
      moveSectionTo(draggedSection, section, afterTarget);
      draggedSection = null;
    });

    sectionHeader.appendChild(sectionCheckbox);
    sectionHeader.appendChild(sectionTitleText);
    sectionControl.appendChild(sectionHeader);
    sectionControl.appendChild(sectionRows);

    section.control = sectionControl;
  });

  renderSectionControls();

  openButton.addEventListener("click", openPanel);
  closeButtons.forEach(function (button) {
    button.addEventListener("click", closePanel);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
    }
  });

  targetSelect.addEventListener("change", update);
  themeSelect.addEventListener("change", update);
  profilePlacementSelect.addEventListener("change", update);
  profileImageSizeSelect.addEventListener("change", update);
  showProfileLinksCheckbox.addEventListener("change", update);
  scaleFillCheckbox.addEventListener("change", update);

  printButton.addEventListener("click", function () {
    var pages = update();
    var target = targetSelect.value ? Number(targetSelect.value) : null;

    if (target && pages > target && !window.confirm("Selected content is estimated at " + pages + " pages. Continue to print anyway?")) {
      return;
    }

    document.documentElement.classList.add("cv-export-printing");
    var scale = printScale();
    var page = buildPrintPage(false);
    setPrintScales(page, scale);
    window.print();
  });

  window.addEventListener("afterprint", removePrintPage);
  updateThemeClass();
})();
