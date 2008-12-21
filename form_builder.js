// $Id$

/**
 * @file form_builder.js
 * Provide enhancements to the form building user interface.
 */

Drupal.behaviors.formBuilderElement = function(context) {
  var $wrappers = $('div.form-builder-wrapper', context);
  var $elements = $('div.form-builder-element', context);

  // If the context itself is a wrapper, add it to the list.
  if ($(context).is('div.form-builder-wrapper')) {
    $wrappers = $wrappers.add(context);
  }

  // Add over effect on rollover.
  // The .hover() method is not used to avoid issues with nested hovers.
  $wrappers.not('div.form-builder-empty-placeholder')
    .bind('mouseover', Drupal.formBuilder.addHover)
    .bind('mouseout', Drupal.formBuilder.removeHover);

  // Add AJAX to edit links.
  $wrappers.find('span.form-builder-links a.configure').click(Drupal.formBuilder.editField);

  // Add AJAX to remove links.
  $wrappers.find('span.form-builder-links a.remove').click(Drupal.formBuilder.editField);

  // Add AJAX to entire field for easy editing.
  $elements.each(function() {
    if ($(this).children('fieldset').size() == 0) {
      var link = $(this).parents('div.form-builder-wrapper:first').find('a.configure').get(0);
      if (link) {
        $(this).click(Drupal.formBuilder.clickField).addClass('form-builder-clickable');
        $(this).find('div.form-builder-element label').click(Drupal.formBuilder.clickField);
      }
    }
  });

  // Disable field functionality on click.
  $elements.find('input, textarea').bind('mousedown', Drupal.formBuilder.disableField);
};

/**
 * Behavior for the entire form builder. Add drag and drop to elements.
 */
Drupal.behaviors.formBuilder = function(context) {
  $('#form-builder', context).sortable({
    items: 'div.form-builder-wrapper',
    handle: 'div.form-builder-title-bar, div.form-builder-element',
    axis: 'y',
    opacity: 0.8,
    forcePlaceholderSize: true,
    dropOnEmpty: false,
    scroll: true,
    scrollSensitivity: 50,
    distance: 4, // Pixels before dragging starts.
    appendTo: 'body',
    helper: createHelper,
    accept: Drupal.formBuilder.acceptDrag,
    sort: Drupal.formBuilder.elementIndent, // Called on drag.
    start: Drupal.formBuilder.startDrag,
    stop: Drupal.formBuilder.stopDrag,
    change: Drupal.formBuilder.checkFieldsets
  });

  // This helper function is needed to make the appendTo option take effect.
  function createHelper(e, $el) {
    return $el.clone().get(0);
  }
};

Drupal.behaviors.formBuilderTabs = function(context) {
  var $fieldsets = $('fieldset.form-builder-group:not(.form-builer-tabs-processed)', context);
  var $close = $('<a class="close" href="#">' + Drupal.t('Close') + '</a>');
  var $tabs;
  var tabs = '';

  // Convert fieldsets to tabs.
  tabs = '<ul class="form-builder-tabs tabs clear-block">';
  $fieldsets.children('legend').each(function() {
    tabs += '<li>' + this.innerHTML + '</li>';
    $(this).remove();
  });
  tabs += '</ul>';

  // Add the new tabs to the page.
  $tabs = $(tabs);
  $fieldsets.filter(':first').before($close).before($tabs);

  // Hide all the fieldsets except the first.
  $fieldsets.filter(':not(:first)').css('display', 'none');
  $tabs.find('li:first').addClass('active').click(Drupal.formBuilder.clickCancel);

  // Enable tab switching by clicking on each tab.
  $tabs.find('li:not(.close)').each(function(index) {
    $(this).click(function() {
      $fieldsets.filter(':visible').css('display', 'none');
      $fieldsets.eq(index).css('display', 'block');
      $tabs.find('li.active').removeClass('active').unbind('click', Drupal.formBuilder.clickCancel);
      $(this).addClass('active').click(Drupal.formBuilder.clickCancel);
      Drupal.formBuilder.fixTableDragTabs($fieldsets.eq(index).get(0));
    });
  });

  $close.click(Drupal.formBuilder.clickCancel);

  // Add guard class.
  $fieldsets.addClass('form-builer-tabs-processed');
};

/**
 * Submit the delete form via AJAX or close the form with the cancel link.
 */
Drupal.behaviors.formBuilderDeleteConfirmation = function(context) {
  $confirmForm = $('form.confirmation');
  if ($confirmForm.size()) {
    $confirmForm.submit(Drupal.formBuilder.deleteField);
    $confirmForm.find('a').click(Drupal.formBuilder.clickCancel);
  }
}

/**
 * Scrolls the add new field block with the window.
 */
Drupal.behaviors.formBuilderBlockScroll = function(context) {
  var $list = $('ul.form-builder-fields', context);

  if ($list.size()) {
    var $block = $list.parents('div.block:first').css('position', 'relative');
    var blockScrollStart = $block.offset().top;

    function blockScroll() {
      // Do not move the palette while draggin a field.
      if (Drupal.formBuilder.activeDragUi) {
        return;
      }

      var windowOffset = $(window).scrollTop();
      if (windowOffset - blockScrollStart > 0) {
        $block.animate({ top: (windowOffset - blockScrollStart + 20) + 'px' }, 'fast');
      }
      else {
        $block.animate({ top: '0px' }, 'fast');
      }
    }

    var timeout = false;
    function scrollTimeout() {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(blockScroll, 100);
    }

    $(window).scroll(scrollTimeout);
  }
}

/**
 * Behavior for the Add a new field block.
 * @param {Object} context
 */
Drupal.behaviors.formBuilderNewField = function(context) {
  var $list = $('ul.form-builder-fields', context);

  if ($list.size()) {
    // Allow items to be copied from the list of new fields.
    $list.children('li:not(.ui-draggable)').draggable({
      opacity: 0.8,
      helper: 'clone',
      scroll: true,
      scrollSensitivity: 50,
      containment: 'body',
      connectToSortable: $('#form-builder'),
      start: Drupal.formBuilder.startPaletteDrag,
      stop: Drupal.formBuilder.stopPaletteDrag,
    });
  }
}

Drupal.formBuilder = {
  // Variable to prevent multiple requests.
  updatingElement: false,
  // Variables to allow delayed updates on textfields and textareas.
  updateDelayElement: false,
  updateDelay: false,
  // Variable holding the actively edited element (if any).
  activeElement: false,
  // Variable holding the active drag object (if any).
  activeDragUi: false
};

Drupal.formBuilder.addHover = function() {
  // Do not add hover effect while dragging over other fields.
  if (!Drupal.formBuilder.activeDragUi) {
    if ($(this).find('div.form-builder-hover').size() == 0) {
      $('#form-builder div.form-builder-hover').removeClass('form-builder-hover');
      $(this).addClass('form-builder-hover');
    }
  }
}

Drupal.formBuilder.removeHover = function() {
  if (!Drupal.formBuilder.activeDragUi) {
    $(this).removeClass('form-builder-hover');
  }
}

/**
 * Click handler for fields.
 * 
 * Note this is applied to both the entire field and to the labels within the
 * field, as they have special browser behavior that needs to be overridden.
 */
Drupal.formBuilder.clickField = function(e) {
  // Allow select lists to be clicked on without opening the edit options.
  if ($(e.target).is('select')) {
    return;
  }

  var link = $(this).parents('div.form-builder-wrapper:first').find('a.configure').get(0);
  Drupal.formBuilder.editField.apply(link);

  return false;
}

/**
 * Mousedown event on element previews.
 */
Drupal.formBuilder.disableField = function(e) {
  return false;
}

/**
 * Load the edit form from the server.
 */
Drupal.formBuilder.editField = function() {
  var element = $(this).parents('div.form-builder-wrapper').get(0);
  var link = this;

  // Prevent duplicate clicks from taking effect if already handling a click.
  if (Drupal.formBuilder.updatingElement) {
    return false;
  }

  // If clicking on the link a second time, close the form instead of open.
  if (element == Drupal.formBuilder.activeElement && link == Drupal.formBuilder.activeLink) {
    $(link).addClass('progress');
    Drupal.formBuilder.closeActive(function() {
      $(link).removeClass('progress');
    });
    Drupal.formBuilder.unsetActive();
    return false;
  }

  var getForm = function() {
    $.ajax({
      url: link.href,
      type: 'GET',
      dataType: 'json',
      data: 'js=1',
      success: Drupal.formBuilder.displayForm,
    });
  };

  $(link).addClass('progress');
  Drupal.formBuilder.updatingElement = true;
  Drupal.formBuilder.closeActive(getForm);
  Drupal.formBuilder.setActive(element, link);

  return false;
};

/**
 * Click handler for deleting a field.
 */
Drupal.formBuilder.deleteField = function() {
  $(this).parents('div.form-builder-wrapper:first').animate({ height: 'hide', opacity: 'hide' }, 'normal', function() {
    // If this is a unique field, show the field in the palette again.
    var elementId = $(this).find('div.form-builder-element').attr('id');
    $('ul.form-builder-fields').find('li.' + elementId).slideDown();
    // Remove the field from the form.
    $(this).remove();
  });
}

Drupal.formBuilder.clickCancel = function() {
  Drupal.formBuilder.closeActive();
  Drupal.formBuilder.unsetActive();
  return false;
}

/**
 * Display the edit form from the server.
 */
Drupal.formBuilder.displayForm = function(response) {
  var $preview = $('#form-builder-element-' + response.elementId);
  var $form = $(response.html).insertAfter($preview).css('display', 'none');
  Drupal.attachBehaviors($form.parent().get(0));

  $form
    // Add the ajaxForm behavior to the new form.
    .ajaxForm()
    // Using the 'data' $.ajaxForm property doesn't seem to work.
    // Manually add a hidden element to pass additional data on submit.
    .prepend('<input type="hidden" name="return" value="field" />');

  // Bind a function to all elements to update the preview on change.
  $form.find('input, textarea, select').bind('change', Drupal.formBuilder.elementChange);
  $form.find('input.form-text, textarea').bind('keyup', Drupal.formBuilder.elementPendingChange)

  $form.slideDown(function() {
    $form.parents('div.form-builder-wrapper:first').find('a.progress').removeClass('progress');
  });
  //Drupal.unfreezeHeight();

  Drupal.formBuilder.updatingElement = false;
};

/**
 * Upon changing a field, submit via AJAX to the server.
 */
Drupal.formBuilder.elementChange = function() {
  if (!Drupal.formBuilder.updatingElement) {
    $(this).parents('form:first').ajaxSubmit({
      success: Drupal.formBuilder.updateElement,
      dataType: 'json',
    });
  }

  // Clear any pending updates until further changes are made.
  if (Drupal.formBuilder.updateDelay) {
    clearTimeout(Drupal.formBuilder.updateDelay);
  }

  Drupal.formBuilder.updatingElement = true;
};

/**
 * Update a field after a delay.
 *
 * Similar to immediately changing a field, this field as pending changes that
 * will be updated after a delay. This includes textareas and textfields in
 * which updating continuously would be a strain the server and actually slow
 * down responsiveness.
 */
Drupal.formBuilder.elementPendingChange = function(e) {
  // Only operate on "normal" keys, excluding special function keys.
  // http://protocolsofmatrix.blogspot.com/2007/09/javascript-keycode-reference-table-for.html
  if (!(
    e.keyCode >= 48 && e.keyCode <= 90 || // 0-9, A-Z.
    e.keyCode >= 93 && e.keyCode <= 111 || // Number pad.
    e.keyCode >= 186 && e.keyCode <= 222 || // Symbols.
    e.keyCode == 8) // Backspace.
    ) {
    return;
  }

  if (Drupal.formBuilder.updateDelay) {
    clearTimeout(Drupal.formBuilder.updateDelay);
  }
  Drupal.formBuilder.updateDelayElement = this;
  Drupal.formBuilder.updateDelay = setTimeout("Drupal.formBuilder.elementChange.apply(Drupal.formBuilder.updateDelayElement, [true])", 500);
};

/**
 * After submitting the change to the server, display the updated element.
 */
Drupal.formBuilder.updateElement = function(response) {
  var $configureForm = $('#form-builder-field-configure');

  // Set the error class on fields.
  $configureForm.find('.error').removeClass('error');
  if (response.errors) {
    for (var elementName in response.errors) {
      elementName = elementName.replace(/([a-z0-9_]+)\](.*)/, '$1$2]');
      $configureForm.find('[name=' + elementName + ']').addClass('error');
    }
  }

  // Display messages, if any.
  $configureForm.find('.messages').remove();
  if (response.messages) {
    $configureForm.find('fieldset:visible').prepend(response.messages);
  }

  // Do not update the element if errors were received.
  if (!response.errors) {
    var $exisiting = $('#form-builder-element-' + response.elementId);
    var $new = $(response.html).find('div.form-builder-element:first');
    $exisiting.replaceWith($new);
    Drupal.attachBehaviors($new.parent().get(0));
  }

  // Set the variable stating we're done updating.
  Drupal.formBuilder.updatingElement = false;
};

/**
 * When adding a new field, remove the placeholder and insert the new element.
 */
Drupal.formBuilder.addElement = function(response) {
  // This is very similar to the update element callback, only we replace the
  // entire wrapper instead of just the element.
  var $exisiting = $('#form-builder-element-' + response.elementId).parent();
  var $new = $(response.html).find('div.form-builder-element:first').parent();
  $exisiting.replaceWith($new);
  Drupal.attachBehaviors($new.get(0));

  // Set the variable stating we're done updating.
  Drupal.formBuilder.updatingElement = false;

  // Insert the new position form containing the new element.
  $('#form-builder-positions').replaceWith(response.positionForm);

  // Submit the new positions form to save the new element position.
  Drupal.formBuilder.updateElementPosition($new.get(0));
};

/**
 * Given an element, update it's position (weight and parent) on the server.
 */
Drupal.formBuilder.updateElementPosition = function(element) {
  // Update weights of all children within this element's parent.
  $(element).parent().children('div.form-builder-wrapper').each(function(index) {
    var child_id = $(this).children('div.form-builder-element:first').attr('id');
    $('#form-builder-positions input.form-builder-weight').filter('.' + child_id).val(index);
  });

  // Update this element's parent.
  var $parent = $(element).parents('div.form-builder-element:first');
  var parent_id = $parent.size() ? $parent.attr('id').replace(/form-builder-element-(.*)/, '$1') : 0;
  var child_id = $(element).children('div.form-builder-element:first').attr('id');
  $('#form-builder-positions input.form-builder-parent').filter('.' + child_id).val(parent_id);

  // Submit the position form via AJAX to save the new weights and parents.
  $('#form-builder-positions').ajaxSubmit();
}

/**
 * Called when a field is hovering over a potential landing spot.
 */
Drupal.formBuilder.acceptDrag = function(e, ui) {
  console.log(e);
  console.log(this);
  return true;
}

/**
 * Called when a field is about to be moved via Sortables.
 *
 * @param e
 *   The event object containing status information about the event.
 * @param ui
 *   The jQuery Sortables object containing information about the sortable.
 */
Drupal.formBuilder.startDrag = function(e, ui) {
  Drupal.formBuilder.activeDragUi = ui;
}

/**
 * Called when a field has been moved via Sortables.
 *
 * @param e
 *   The event object containing status information about the event.
 * @param ui
 *   The jQuery Sortables object containing information about the sortable.
 */
Drupal.formBuilder.stopDrag = function(e, ui){
  var element = ui.item.get(0);

  // If the element is a new field from the palette, update it with a real field.
  if ($(element).is('.ui-draggable')) {
    var name = 'new_' + new Date().getTime();
    // If this is a "unique" element, its element ID is hard-coded.
    if ($(element).is('.form-builder-unique')) {
      name = element.className.replace(/^.*?form-builder-element-([a-z0-9_]+).*?$/, '$1');
    }

    var $ajaxPlaceholder = $('<div class="form-builder-wrapper form-builder-new-field"><div id="form-builder-element-' + name + '" class="form-builder-element"><span class="progress">' + Drupal.t('Please wait...') + '</span></div></div>');

    $.ajax({
      url: $(element).find('a').get(0).href,
      type: 'GET',
      dataType: 'json',
      data: 'js=1&element_id=' + name,
      success: Drupal.formBuilder.addElement,
    });

    $(element).replaceWith($ajaxPlaceholder);

    Drupal.formBuilder.updatingElement = true;
  }
  // Update the positions (weights and parents) in the form cache.
  else {
    Drupal.formBuilder.updateElementPosition(element);
  }

  Drupal.formBuilder.activeDragUi = false;

  // Scroll the palette into view.
  $(window).scroll();
}

/**
 * Called when a field is about to be moved from the new field palette.
 *
 * @param e
 *   The event object containing status information about the event.
 * @param ui
 *   The jQuery Sortables object containing information about the sortable.
 */
Drupal.formBuilder.startPaletteDrag = function(e, ui) {
  if ($(this).is('.form-builder-unique')) {
    $(this).css('visibility', 'hidden');
  }

  Drupal.formBuilder.activeDragUi = ui;
}

/**
 * Called after a field has been moved from the new field palette.
 *
 * @param e
 *   The event object containing status information about the event.
 * @param ui
 *   The jQuery Sortables object containing information about the sortable.
 */
Drupal.formBuilder.stopPaletteDrag = function(e, ui) {
  // If the activeDragUi is still set, we did not drop onto the form.
  if (Drupal.formBuilder.activeDragUi) {
    Drupal.formBuilder.activeDragUi = false;
    $(this).css('visibility', '');
    $(window).scroll();
  }
  // If dropped onto the form and a unique field, remove it from the palette.
  else if ($(this).is('.form-builder-unique')){
    $(this).animate({ height: '0' }, function() {
      $(this).css({ visibility: '', height: '', display: 'none' });
    });
  }
}

/**
 * Update the indentation and width of elements as they move over fieldsets.
 *
 * This function is called on every mouse movement during a Sortables drag.
 *
 * @param e
 *   The event object containing status information about the event.
 * @param ui
 *   The jQuery Sortables object containing information about the sortable.
 */
Drupal.formBuilder.elementIndent = function(e, ui) {
  var placeholder = ui.placeholder.get(0);
  var helper = ui.helper.get(0);
  var item = ui.item.get(0);

  // Do not affect the elements being dragged from the pallette.
  if ($(item).is('li')) {
    return;
  }

  // Turn on the placeholder item (which is in the final location) to take some stats.
  $(placeholder).css('visibility', 'visible');
  var difference = $(helper).width() - $(placeholder).width();
  var offset = $(placeholder).offset().left;
  $(placeholder).css('visibility', 'hidden');

  // Adjust the helper to match the location and width of the real item.
  var newWidth = $(helper).width() - difference;
  $(helper).css('width', newWidth + 'px');
  $(helper).css('left', offset + 'px');
}

/**
 * Insert DIVs into empty fieldsets so that items can be dropped within them.
 *
 * This function is called every time an element changes positions during
 * a Sortables drag and drop operation.
 *
 * @param e
 *   The event object containing status information about the event.
 * @param ui
 *   The jQuery Sortables object containing information about the sortable.
 */
Drupal.formBuilder.checkFieldsets = function(e, ui) {
  var $fieldsets = ui.element.find('div.form-builder-element > fieldset');
  var $placeholder = ui.placeholder;
  var emptyFieldsets = [];

  // Remove all current fieldset placeholders.
  $fieldsets.find('div.form-builder-empty-placeholder').remove();

  // Find all empty fieldsets.
  $fieldsets.each(function() {
    // Check for empty collapsible fieldsets.
    if ($(this).children('div.fieldset-wrapper').size()) {
      if ($(this).children('div.fieldset-wrapper').children().size() == 0) {
        emptyFieldsets.push(this);
      }
    }
    // Check for empty normal fieldsets.
    if ($(this).children(':not(legend)').size() == 0) {
      emptyFieldsets.push(this);
    }
  });

  // Add a placeholder DIV in the empty fieldsets.
  $(emptyFieldsets).each(function() {
    var wrapper = $(this).children('div.fieldset-wrapper').get(0) || this;
    $(Drupal.settings.formBuilder.emptyFieldset).appendTo(wrapper);
  });


  $(ui.element).sortable('refresh');
}

Drupal.formBuilder.setActive = function(element, link) {
  Drupal.formBuilder.unsetActive();
  Drupal.formBuilder.activeElement = element;
  Drupal.formBuilder.activeLink = link;
  $(Drupal.formBuilder.activeElement).addClass('form-builder-active');
};

Drupal.formBuilder.unsetActive = function() {
  if (Drupal.formBuilder.activeElement) {
    $(Drupal.formBuilder.activeElement).removeClass('form-builder-active');
    Drupal.formBuilder.activeElement = false;
    Drupal.formBuilder.activeLink = false;
  }
}

Drupal.formBuilder.closeActive = function(callback) {
  if (Drupal.formBuilder.activeElement) {
    var $activeForm = $(Drupal.formBuilder.activeElement).find('form');

    if ($activeForm.size()) {
      Drupal.freezeHeight();
      $activeForm.slideUp(function(){
        $(this).remove();
        if (callback) {
          callback.call();
        }
      });
    }
  }
  else if (callback) {
    callback.call();
  }

  return false;
};

/**
 * Work around for tabledrags within tabs. On load, if the tab was hidden the
 * offsets cannot be calculated correctly. Recalculate and update the tableDrag.
 */
Drupal.formBuilder.fixTableDragTabs = function(context) {
  if (Drupal.tableDrag && Drupal.tableDrag.length > 1) {
    for (var n in Drupal.tableDrag) {
      if (typeof(Drupal.tableDrag[n]) == 'object') {
        var table = $('#' + n, context).get(0);
        if (table) {
          var indent = Drupal.theme('tableDragIndentation');
          var testCell = $('tr.draggable:first td:first', table).prepend(indent).prepend(indent);
          Drupal.tableDrag[n].indentAmount = $('.indentation', testCell).get(1).offsetLeft - $('.indentation', testCell).get(0).offsetLeft;
          $('.indentation', testCell).slice(0, 2).remove();
        }
      }
    }
  }
}
