(function () {
  var panel = document.querySelector("[data-cv-export]");
  var openButton = document.querySelector("[data-cv-export-open]");

  if (!panel || !openButton) {
    return;
  }

  var rowsContainer = panel.querySelector("[data-cv-export-options]");
  var status = panel.querySelector("[data-cv-export-status]");
  var printButton = panel.querySelector("[data-cv-export-print]");
  var languageSelect = panel.querySelector("[data-cv-export-language]");
  var targetSelect = panel.querySelector("[data-cv-export-target]");
  var themeSelect = panel.querySelector("[data-cv-export-theme]");
  var profileImageSizeSelect = panel.querySelector("[data-cv-export-profile-image-size]");
  var showProfileLinksCheckbox = panel.querySelector("[data-cv-export-show-profile-links]");
  var scaleFillCheckbox = panel.querySelector("[data-cv-export-scale-fill]");
  var documentRoot = document.querySelector("[data-cv-export-document]");
  var closeButtons = Array.prototype.slice.call(panel.querySelectorAll("[data-cv-export-close]"));
  var printDocument = null;
  var draggedSection = null;
  var minPrintScale = 0.88;
  var maxPrintScale = 1.12;
  var compactEntryTitlesClass = "cv-export-compact-entry-titles";

  if (!rowsContainer || !status || !printButton || !targetSelect || !themeSelect || !profileImageSizeSelect || !showProfileLinksCheckbox || !scaleFillCheckbox || !documentRoot) {
    return;
  }

  function label(name) {
    return panel.dataset["cvExportLabel" + name] || "";
  }

  openButton.addEventListener("click", openPanel);
  closeButtons.forEach(function (button) {
    button.addEventListener("click", closePanel);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      closePanel();
    }
  });

  var activeDocumentRoot = documentRoot;
  var activeBio = document.querySelector(".bio");
  var sections = [];

  function buildSections(root) {
    return Array.prototype.slice.call(root.querySelectorAll(".cv-page__content h2")).map(function (heading) {
      var list = heading.nextElementSibling;
      if (!list || !list.classList.contains("jr__list")) {
        return null;
      }

      return {
        control: null,
        enabled: true,
        heading: heading,
        key: list.className,
        rows: Array.prototype.slice.call(list.querySelectorAll(".jr__item")),
        title: cleanText(heading)
      };
    }).filter(function (section) {
      return section && section.rows.length;
    });
  }

  function resetSectionState() {
    sections.forEach(function (section) {
      section.rows.forEach(function (row) {
        row.classList.remove("cv-export-hidden");
        delete row.dataset.cvExportPlacement;
      });
    });
  }

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
    try {
      update();
    } catch (error) {
      status.textContent = error && error.message ? error.message : "";
      status.classList.add("cv-export__status--warning");
    }
  }

  function removePrintPage() {
    if (printDocument) {
      printDocument.remove();
      printDocument = null;
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

  function selectedRows(section, placement) {
    if (!section.enabled) {
      return [];
    }

    return section.rows.filter(function (row) {
      return !row.classList.contains("cv-export-hidden") && row.dataset.cvExportPlacement === placement;
    });
  }

  function buildColumnState(placement) {
    return {
      placement: placement,
      profilePending: placement === "side" && Boolean(activeBio),
      rowIndex: 0,
      sectionIndex: 0,
      sections: sections.map(function (section) {
        return {
          heading: section.heading,
          list: section.heading ? section.heading.nextElementSibling : null,
          rows: selectedRows(section, placement)
        };
      }).filter(function (section) {
        return section.list && section.rows.length;
      }),
      titlePending: placement === "main"
    };
  }

  function columnHasRemaining(state) {
    return state.titlePending || state.profilePending || state.sectionIndex < state.sections.length;
  }

  function profileLinkText(href) {
    return href
      .replace(/^mailto:/, "")
      .replace(/^https?:\/\/(?:www\.)?/i, "")
      .replace(/\/$/, "");
  }

  function addProfileLinks(bioClone) {
    bioClone.classList.toggle("cv-export-profile-links-visible", showProfileLinksCheckbox.checked);

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

  function dateRangeIsOnOwnRow(range) {
    var tolerance = 1;
    var row = range.closest(".jr__item-meta");
    var rowFirst = row ? row.firstElementChild : null;

    if (!rowFirst || rowFirst === range) {
      return false;
    }

    var rangeBox = range.getBoundingClientRect();
    var rowFirstBox = rowFirst ? rowFirst.getBoundingClientRect() : rangeBox;

    return rangeBox.top > rowFirstBox.bottom - tolerance;
  }

  function updateEntryTitleCompaction(root) {
    root.classList.remove(compactEntryTitlesClass);

    var ranges = Array.prototype.slice.call(root.querySelectorAll(".cv-export-print-main .jr__date-range"));
    var shouldCompact = ranges.some(dateRangeIsOnOwnRow);

    root.classList.toggle(compactEntryTitlesClass, shouldCompact);
    return shouldCompact;
  }

  function appendProfile(column) {
    var bioClone = activeBio.cloneNode(true);
    bioClone.classList.add("cv-export-print-profile");
    bioClone.classList.add("cv-export-image-" + profileImageSizeSelect.value);
    addProfileLinks(bioClone);
    column.appendChild(bioClone);
  }

  function columnOverflows(column) {
    return column.scrollHeight > column.clientHeight + 1;
  }

  function advanceCompletedSection(state) {
    var section = state.sections[state.sectionIndex];
    if (section && state.rowIndex >= section.rows.length) {
      state.sectionIndex += 1;
      state.rowIndex = 0;
    }
  }

  function fillColumn(column, state) {
    var progress = 0;

    if (state.titlePending) {
      var title = activeDocumentRoot.querySelector(".cv-page__content h1");
      state.titlePending = false;
      if (title) {
        column.appendChild(title.cloneNode(true));
        progress += 1;
      }
    }

    if (state.profilePending) {
      state.profilePending = false;
      appendProfile(column);
      progress += 1;
    }

    while (state.sectionIndex < state.sections.length) {
      var section = state.sections[state.sectionIndex];
      var heading = cloneHeading(section.heading);
      var list = section.list.cloneNode(false);
      var addedRows = 0;

      column.appendChild(heading);
      column.appendChild(list);

      while (state.rowIndex < section.rows.length) {
        var row = section.rows[state.rowIndex].cloneNode(true);
        list.appendChild(row);

        if (columnOverflows(column)) {
          row.remove();

          if (!addedRows) {
            list.remove();
            heading.remove();

            if (!column.children.length) {
              column.appendChild(heading);
              column.appendChild(list);
              list.appendChild(row);
              state.rowIndex += 1;
              progress += 1;
              advanceCompletedSection(state);
            }
          }

          return progress;
        }

        state.rowIndex += 1;
        addedRows += 1;
        progress += 1;
      }

      advanceCompletedSection(state);
    }

    return progress;
  }

  function createPrintPage(documentElement, hasSidebar) {
    var page = document.createElement("section");
    var main = document.createElement("div");

    page.className = "cv-export-print-page";
    main.className = "cv-export-print-main";

    if (!hasSidebar) {
      page.classList.add("cv-export-print-page--main-only");
    }

    page.appendChild(main);

    if (hasSidebar) {
      var side = document.createElement("aside");
      side.className = "cv-export-print-side";
      page.appendChild(side);
    }

    documentElement.appendChild(page);
    return page;
  }

  function paginateIntoDocument(documentElement) {
    var mainState = buildColumnState("main");
    var sideState = buildColumnState("side");
    var pageCount = 0;

    while ((columnHasRemaining(mainState) || columnHasRemaining(sideState)) && pageCount < 100) {
      var hasSidebar = columnHasRemaining(sideState);
      var page = createPrintPage(documentElement, hasSidebar);
      var mainProgress = fillColumn(page.querySelector(".cv-export-print-main"), mainState);
      var sideProgress = hasSidebar ? fillColumn(page.querySelector(".cv-export-print-side"), sideState) : 0;

      pageCount += 1;

      if (!mainProgress && !sideProgress && (columnHasRemaining(mainState) || columnHasRemaining(sideState))) {
        throw new Error("Selected content cannot be split into A4 pages.");
      }
    }

    return pageCount || 1;
  }

  function setDocumentScale(documentElement, scale) {
    documentElement.style.setProperty("--cv-export-main-scale", String(scale.main));
    documentElement.style.setProperty("--cv-export-side-scale", String(scale.side));
    documentElement.style.setProperty("--cv-export-heading-scale", String(scale.main));
  }

  function buildPrintDocument(scale, measureOnly) {
    removePrintPage();

    var documentElement = document.createElement("div");
    documentElement.className = "cv-export-print-document";
    if (measureOnly) {
      documentElement.classList.add("cv-export-measure");
    }

    setDocumentScale(documentElement, scale);
    document.body.appendChild(documentElement);
    printDocument = documentElement;
    paginateIntoDocument(documentElement);

    if (updateEntryTitleCompaction(documentElement)) {
      documentElement.replaceChildren();
      paginateIntoDocument(documentElement);
    }

    return documentElement;
  }

  function scalePair(value) {
    return {
      main: value,
      side: value
    };
  }

  function fitsPageShape(result, pageLimit, sidebarLimit) {
    return result.pages <= pageLimit && result.sidebarPages <= sidebarLimit;
  }

  function findLargestScale(pageLimit, sidebarLimit, lower, measure) {
    var upper = maxPrintScale;
    var best = lower;

    if (fitsPageShape(measure(upper), pageLimit, sidebarLimit)) {
      return upper;
    }

    if (!fitsPageShape(measure(lower), pageLimit, sidebarLimit)) {
      return lower;
    }

    for (var index = 0; index < 8; index += 1) {
      var next = (lower + upper) / 2;
      if (fitsPageShape(measure(next), pageLimit, sidebarLimit)) {
        best = next;
        lower = next;
      } else {
        upper = next;
      }
    }

    return best;
  }

  function measurePages() {
    var cache = {};
    var measure = function (value) {
      var key = value.toFixed(5);
      if (!cache[key]) {
        var documentElement = buildPrintDocument(scalePair(value), true);
        cache[key] = {
          pages: documentElement.querySelectorAll(".cv-export-print-page").length,
          sidebarPages: documentElement.querySelectorAll(".cv-export-print-page:not(.cv-export-print-page--main-only)").length
        };
        removePrintPage();
      }
      return cache[key];
    };
    var mode = targetSelect.value;
    var value = 1;

    if (scaleFillCheckbox.checked) {
      if (mode === "none") {
        var natural = measure(1);
        value = findLargestScale(natural.pages, natural.sidebarPages, 1, measure);
      } else if (mode === "minimum") {
        var minimum = measure(minPrintScale);
        value = findLargestScale(minimum.pages, minimum.sidebarPages, minPrintScale, measure);
      } else {
        var target = Number(mode);
        var naturalPages = measure(1).pages;
        var minimumResult = measure(minPrintScale);
        var minimumPages = minimumResult.pages;
        var pageLimit = minimumPages > target ? minimumPages : Math.min(target, naturalPages);
        value = findLargestScale(pageLimit, minimumResult.sidebarPages, minPrintScale, measure);
      }
    }

    return {
      pages: measure(value).pages,
      scale: scalePair(value)
    };
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
      return " " + label("AutoFit") + " " + Math.round(scale.main * 100) + "%.";
    }

    return " " + label("AutoFit") + " " + label("AutoFitMain") + " " + Math.round(scale.main * 100) + "%, " + label("AutoFitSidebar") + " " + Math.round(scale.side * 100) + "%.";
  }

  function selectedPageTarget() {
    var target = Number(targetSelect.value);
    return Number.isFinite(target) && target > 0 ? target : null;
  }

  function update() {
    document.documentElement.classList.add("cv-export-filtering");
    document.documentElement.classList.toggle("cv-export-target-one", targetSelect.value === "1");
    updateThemeClass();

    var estimate = measurePages();
    var pages = estimate.pages;
    var target = selectedPageTarget();
    var estimateText = label("Estimated") + " " + pages + " " + (pages === 1 ? label("Page") : label("Pages")) + "." + scaleNote(estimate.scale);

    if (target && pages > target) {
      status.textContent = estimateText + " " + label("Warning");
      status.classList.add("cv-export__status--warning");
    } else {
      status.textContent = estimateText;
      status.classList.remove("cv-export__status--warning");
    }

    return estimate;
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

  function exportSourceUrl(value) {
    return new URL(value || window.location.pathname, window.location.href).href;
  }

  function loadExportLanguage(url) {
    var previousStatusText = status.textContent;
    var previousStatusWarning = status.classList.contains("cv-export__status--warning");
    return fetch(exportSourceUrl(url), {
      credentials: "same-origin"
    }).then(function (response) {
      if (!response.ok) {
        throw new Error(response.status + " " + response.statusText);
      }
      return response.text();
    }).then(function (html) {
      var parsed = new DOMParser().parseFromString(html, "text/html");
      var nextRoot = parsed.querySelector("[data-cv-export-document]");
      var nextBio = parsed.querySelector(".bio");

      if (!nextRoot || !nextBio) {
        throw new Error("Could not load selected CV language.");
      }

      var nextSections = buildSections(nextRoot);
      activeDocumentRoot = nextRoot;
      activeBio = nextBio;

      if (canPatchSections(nextSections)) {
        patchSectionControls(nextSections);
      } else {
        rebuildSectionControls(nextRoot, nextBio);
      }

      update();
    }).catch(function (error) {
      status.textContent = error && error.message ? error.message : previousStatusText;
      status.classList.toggle("cv-export__status--warning", previousStatusWarning);
      status.classList.add("cv-export__status--warning");
    });
  }

  function renderSectionControls() {
    var fragment = document.createDocumentFragment();

    sections.forEach(function (section) {
      section.control.classList.toggle("cv-export__section--dragging", section === draggedSection);
      section.control.classList.toggle("cv-export__section--disabled", !section.enabled);
      fragment.appendChild(section.control);
    });

    rowsContainer.replaceChildren(fragment);
  }

  function createSectionControl(section, rowIndexState) {
    var sectionControl = document.createElement("section");
    sectionControl.className = "cv-export__section";

    var sectionHeader = document.createElement("div");
    sectionHeader.className = "cv-export__section-header";

    var sectionCheckbox = document.createElement("input");
    sectionCheckbox.type = "checkbox";
    sectionCheckbox.checked = true;
    sectionCheckbox.setAttribute("aria-label", label("Include") + " " + section.title);

    var sectionTitleText = document.createElement("span");
    sectionTitleText.className = "cv-export__section-title";
    sectionTitleText.textContent = section.title;

    var sectionRows = document.createElement("div");
    sectionRows.className = "cv-export__section-rows";

    section.rows.forEach(function (row) {
      var id = "cv-export-row-" + rowIndexState.value;
      var placement = defaultPlacement(row);
      rowIndexState.value += 1;
      row.classList.remove("cv-export-hidden");
      row.dataset.cvExportPlacement = placement;

      var rowControl = document.createElement("div");
      rowControl.className = "cv-export__row";

      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.id = id;

      var rowLabel = document.createElement("label");
      rowLabel.htmlFor = id;

      var text = document.createElement("span");
      text.textContent = rowTitle(row);
      rowLabel.appendChild(text);

      var placementSelect = document.createElement("select");
      placementSelect.setAttribute("aria-label", label("PdfColumnFor") + " " + rowTitle(row));

      var mainOption = document.createElement("option");
      mainOption.value = "main";
      mainOption.textContent = label("Main");

      var sideOption = document.createElement("option");
      sideOption.value = "side";
      sideOption.textContent = label("Sidebar");

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
      rowControl.appendChild(rowLabel);
      rowControl.appendChild(placementSelect);
      sectionRows.appendChild(rowControl);

      row._cvExportControl = {
        label: rowLabel,
        placementSelect: placementSelect,
        text: text
      };
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
    section.titleElement = sectionTitleText;
    section.rowsElement = sectionRows;
  }

  function canPatchSections(nextSections) {
    return sections.every(function (section) {
      var nextSection = nextSections.find(function (candidate) {
        return candidate.key === section.key;
      });
      return nextSection && section.rows.length === nextSection.rows.length;
    });
  }

  function patchSectionControls(nextSections) {
    sections.forEach(function (section) {
      var nextSection = nextSections.find(function (candidate) {
        return candidate.key === section.key;
      });
      section.heading = nextSection.heading;
      section.key = nextSection.key;
      section.title = nextSection.title;
      section.titleElement.textContent = nextSection.title;

      section.rows.forEach(function (row, rowIndex) {
        var nextRow = nextSection.rows[rowIndex];
        nextRow.classList.toggle("cv-export-hidden", row.classList.contains("cv-export-hidden"));
        nextRow.dataset.cvExportPlacement = row.dataset.cvExportPlacement;
        section.rows[rowIndex] = nextRow;

        if (row._cvExportControl) {
          row._cvExportControl.text.textContent = rowTitle(nextRow);
          row._cvExportControl.placementSelect.setAttribute("aria-label", label("PdfColumnFor") + " " + rowTitle(nextRow));
          nextRow._cvExportControl = row._cvExportControl;
        }
      });
    });
  }

  function rebuildSectionControls(root, bio) {
    resetSectionState();
    activeDocumentRoot = root;
    activeBio = bio;
    sections = buildSections(activeDocumentRoot);

    var rowIndexState = {
      value: 0
    };

    sections.forEach(function (section) {
      createSectionControl(section, rowIndexState);
    });

    renderSectionControls();
  }

  rebuildSectionControls(activeDocumentRoot, activeBio);

  targetSelect.addEventListener("change", update);
  if (languageSelect) {
    languageSelect.addEventListener("change", function () {
      if (languageSelect.value) {
        loadExportLanguage(languageSelect.value);
      }
    });
  }
  themeSelect.addEventListener("change", update);
  profileImageSizeSelect.addEventListener("change", update);
  showProfileLinksCheckbox.addEventListener("change", update);
  scaleFillCheckbox.addEventListener("change", update);

  printButton.addEventListener("click", function () {
    var estimate = update();

    buildPrintDocument(estimate.scale, false);
    document.documentElement.classList.add("cv-export-printing");
    window.print();
  });

  window.addEventListener("afterprint", removePrintPage);
  updateThemeClass();
})();
