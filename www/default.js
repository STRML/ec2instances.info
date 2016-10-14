'use strict';

var data_table = null;

var defaults = {
  cost_duration: 'hourly',
  region: 'us-east-1',
  reserved_term: 'yrTerm1Standard.noUpfront',
  memory: 0,
  computeunits: 0,
  storage: 0
};

var settings = store.get('ec2_settings') || {};
for (var key in defaults) {
  if (settings[key] == null) settings[key] = defaults[key];
}

function init_data_table() {
  data_table = $('#data').DataTable({
    "bPaginate": false,
    "bInfo": false,
    "bStateSave": true,
    "oSearch": {
      "bRegex" : true,
      "bSmart": false
    },
    "aoColumnDefs": [
      {
        "aTargets": [
          "memory",
          "computeunits",
          "vcpus",
          "storage",
          "ebs-throughput",
          "ebs-iops",
          "ebs-max-bandwidth",
          "networkperf",
          "cost-ondemand",
          "cost-reserved"
        ],
        "sType": "span-sort"
      },
      {
        "aTargets": [
          "ecu-per-vcpu",
          "enhanced-networking",
          "maxips",
          "linux-virtualization",
          "cost-ondemand-mswinSQLWeb",
          "cost-ondemand-mswinSQL",
          "cost-reserved-mswinSQLWeb",
          "cost-reserved-mswinSQL",
          "ebs-throughput",
          "ebs-iops",
          "max_bandwidth"
        ],
        "bVisible": false
      }
    ],
    // default sort by linux cost
    "aaSorting": [
      [ 15, "asc" ]
    ],
    'initComplete': function() {
      // fire event in separate context so that calls to get_data_table()
      // receive the cached object.
      setTimeout(function() {
        on_data_table_initialized();
      }, 0);
    },
    'drawCallback': function() {
      // abort if initialization hasn't finished yet (initial draw)
      if (data_table === null) {
        return;
      }

      // Whenever the table is drawn, update the costs. This is necessary
      // because the cost duration may have changed while a filter was being
      // used and so some rows will need updating.
      redraw_costs();
    },
    // Store filtering, sorting, etc - core datatable feature
    'stateSave': true,
  });

  return data_table;
}

$(document).ready(function() {
  init_data_table();
});


function change_cost(duration) {
  // update menu text
  var first = duration.charAt(0).toUpperCase();
  var text = first + duration.substr(1);
  $("#cost-dropdown .dropdown-toggle .text").text(text);

  // update selected menu option
  $('#cost-dropdown li a').each(function(i, e) {
    e = $(e);
    if (e.attr('duration') == duration) {
      e.parent().addClass('active');
    } else {
      e.parent().removeClass('active');
    }
  });

  var hour_multipliers = {
    "hourly": 1,
    "daily": 24,
    "weekly": (7*24),
    "monthly": (365*24/12),
    "annually": (365*24)
  };
  var multiplier = hour_multipliers[duration];
  var per_time;
  $.each($("td.cost-ondemand"), function(i, elem) {
    elem = $(elem);
    per_time = elem.data("pricing")[settings.region];
    if (per_time && !isNaN(per_time)) {
      per_time = (per_time * multiplier).toFixed(3);
      elem.text("$" + per_time + " " + duration);
    } else {
      elem.text("unavailable");
    }
  });

  $.each($("td.cost-reserved"), function(i, elem) {
    elem = $(elem);
    per_time = elem.data("pricing")[settings.region];

    if(!per_time) {
      elem.text("unavailable");
      return;
    }

    per_time = per_time[settings.reserved_term];

    if (per_time && !isNaN(per_time)) {
      per_time = (per_time * multiplier).toFixed(3);
      elem.text("$" + per_time + " " + duration);
    } else {
      elem.text("unavailable");
    }
  });

  settings.cost_duration = duration;
  maybe_update_url();
}

function change_region(region) {
  settings.region = region;
  var region_name = null;
  $('#region-dropdown li a').each(function(i, e) {
    e = $(e);
    if (e.data('region') === region) {
      e.parent().addClass('active');
      region_name = e.text();
    } else {
      e.parent().removeClass('active');
    }
  });
  $("#region-dropdown .dropdown-toggle .text").text(region_name);
  change_cost(settings.cost_duration);
}

function change_reserved_term(term) {
  settings.reserved_term = term;
  var $dropdown = $('#reserved-term-dropdown'),
      $activeLink = $dropdown.find('li a[data-reserved-term="'+term+'"]'),
      term_name = $activeLink.text();

  $dropdown.find('li').removeClass('active');
  $activeLink.closest('li').addClass('active');

  $dropdown.find('.dropdown-toggle .text').text(term_name);
  change_cost(settings.cost_duration);
}

// Update all visible costs to the current duration.
// Called after new columns or rows are shown as their costs may be inaccurate.
function redraw_costs() {
  change_cost(settings.cost_duration);
}

function setup_column_toggle() {
  $.each(data_table.columns().indexes(), function(i, idx) {
    var column = data_table.column(idx);
    $("#filter-dropdown ul").append(
      $('<li>')
      .toggleClass('active', column.visible())
      .append(
        $('<a>', {href: "javascript:;"})
        .text($(column.header()).text())
        .click(function(e) {
          toggle_column(i);
          $(this).parent().toggleClass("active");
          $(this).blur(); // prevent focus style from sticking in Firefox
          e.stopPropagation(); // keep dropdown menu open
        })
      )
    );
  });
}

function setup_clear() {
  $('.btn-clear').click(function() {
    // Reset app.
    settings = JSON.parse(JSON.stringify(defaults)); // clone
    maybe_update_url();
    store.clear();
    data_table.state.clear();
    window.location.reload();
  });
}

function url_for_selections() {
  var settings = {
    min_memory: settings['memory'],
    min_computeunits: settings['computeunits'],
    min_storage: settings['storage'],
    filter: data_table.settings()[0].oPreviousSearch['sSearch'],
    region: settings.region,
    cost: settings.cost_duration,
    term: settings.reserved_term
  };
  for (var key in settings) {
    if (settings[key] === '' || settings[key] == null || settings[key] === defaults[key]) delete settings[key];
  }

  // selected rows
  var selected_row_ids = $('#data tbody tr.highlight').map(function() {
    return this.id;
  }).get();
  if (selected_row_ids.length > 0) {
    settings.selected = selected_row_ids;
  }

  var url = location.origin + location.pathname;
  var parameters = [];
  for (var setting in settings) {
    if (settings[setting] !== undefined) {
      parameters.push(setting + '=' + settings[setting]);
    }
  }
  if (parameters.length > 0)
    url = url + '?' + parameters.join('&');
  return url;
}

function maybe_update_url() {
  // Save localstorage data as well
  store.set('ec2_settings', settings);

  if (!history.replaceState) {
    return;
  }

  try {
    var url = url_for_selections();
    if (document.location == url) {
      return;
    }

    history.replaceState(null, '', url);
  } catch(ex) {
    // doesn't matter
  }
}

var apply_min_values = function() {
    var all_filters = $('[data-action="datafilter"]');
    var data_rows = $('#data tr:has(td)');

    data_rows.show();

    all_filters.each(function() {
        var filter_on = $(this).data('type');
        var filter_val = parseFloat($(this).val()) || 0;

        // update global variable for dynamic URL
        settings[filter_on] = filter_val;

        var match_fail = data_rows.filter(function() {
            var row_val;
            row_val = parseFloat(
                $(this).find('td[class~="' + filter_on + '"] span').attr('sort')
                );
            return row_val < filter_val;
        });

        match_fail.hide();
    });
    maybe_update_url();
};

var app_initialized = false;
function on_data_table_initialized() {
  if (app_initialized) return;
  app_initialized = true;

  // process URL settings
  var url_settings = get_url_parameters();
  for (var key in url_settings) {
    switch(key) {
      case 'region':
        settings.region = url_settings['region'];
        break;
      case 'cost':
        settings.cost_duration = url_settings['cost'];
        break;
      case 'term':
        settings.reserved_term = url_settings['term'];
        break;
      case 'filter':
        data_table.filter(url_settings['filter']);
        break;
      case 'min_memory':
        $('[data-action="datafilter"][data-type="memory"]').val(url_settings['min_memory']);
        apply_min_values();
        break;
      case 'min_computeunits':
        $('[data-action="datafilter"][data-type="computeunits"]').val(url_settings['min_computeunits']);
        apply_min_values();
        break;
      case 'min_storage':
        $('[data-action="datafilter"][data-type="storage"]').val(url_settings['min_storage']);
        apply_min_values();
        break;
      case 'selected':
        // apply highlight to selected rows
        $.each(url_settings['selected'].split(','), function(_, id) {
          id = id.replace('.', '\\.');
          $('#'+id).addClass('highlight');
        });
        break;
    }
  }

  configure_highlighting();

  // Allow row filtering by min-value match.
  $('[data-action=datafilter]').on('keyup', apply_min_values);

  change_region(settings.region);
  change_cost(settings.cost_duration);
  change_reserved_term(settings.reserved_term);

  $.extend($.fn.dataTableExt.oStdClasses, {
    "sWrapper": "dataTables_wrapper form-inline"
  });

  setup_column_toggle();

  setup_clear();

  // enable bootstrap tooltips
  $('abbr').tooltip({
    placement: function(tt, el) {
      return (this.$element.parents('thead').length) ? 'top' : 'right';
    }
  });

  $("#cost-dropdown li").bind("click", function(e) {
    change_cost(e.target.getAttribute("duration"));
  });

  $("#region-dropdown li").bind("click", function(e) {
    change_region($(e.target).data('region'));
  });

  $("#reserved-term-dropdown li").bind("click", function(e) {
    change_reserved_term($(e.target).data('reservedTerm'));
  });

  // apply classes to search box
  $('div.dataTables_filter input').addClass('form-control search');
}

// sorting for colums with more complex data
// http://datatables.net/plug-ins/sorting#hidden_title
jQuery.extend(jQuery.fn.dataTableExt.oSort, {
  "span-sort-pre": function(elem) {
    var matches = elem.match(/sort="(.*?)"/);
    if (matches) {
      return parseFloat(matches[1]);
    }
    return 0;
  },

  "span-sort-asc": function(a, b) {
    return ((a < b) ? -1 : ((a > b) ? 1 : 0));
  },

  "span-sort-desc": function(a, b) {
    return ((a < b) ? 1 : ((a > b) ? -1 : 0));
  }
});

// toggle columns
function toggle_column(col_index) {
  var is_visible = data_table.column(col_index).visible();
  data_table.column(col_index).visible(is_visible ? false : true);
  redraw_costs();
}

// retrieve all the parameters from the location string
function get_url_parameters() {
  var params = location.search.slice(1).split('&');
  var settings = {};
  params.forEach(function(param) {
    settings[param.split('=')[0]] = param.split('=')[1];
  });

  return settings;
}

function configure_highlighting() {
  var compareOn = false,
      $compareBtn = $('.btn-compare'),
      $rows = $('#data tbody tr');

  // Allow row highlighting by clicking.
  $rows.click(function() {
    $(this).toggleClass('highlight');

    if (!compareOn) {
      $compareBtn.prop('disabled', !$rows.is('.highlight'));
    }

    maybe_update_url();
  });

  $compareBtn.prop('disabled', !$($rows).is('.highlight'));
  $compareBtn.text($compareBtn.data('textOff'));

  $compareBtn.click(function() {
    if (compareOn) {
      $rows.show();
      $compareBtn.text($compareBtn.data('textOff'))
                 .addClass('btn-primary')
                 .removeClass('btn-success')
                 .prop('disabled', !$rows.is('.highlight'));
    } else {
      $rows.filter(':not(.highlight)').hide();
      $compareBtn.text($compareBtn.data('textOn'))
                 .addClass('btn-success')
                 .removeClass('btn-primary');
    }

    compareOn = !compareOn;
  });
}
