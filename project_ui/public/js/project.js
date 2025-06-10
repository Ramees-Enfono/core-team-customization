frappe.ui.form.on('Project', {
    refresh: function(frm) {
        // Wait for all form elements to load
        frappe.after_ajax(() => {
            // Clear any existing dashboard
            const existing = $(frm.wrapper).find('.custom-project-dashboard-container');
            if (existing.length) existing.remove();
            
            // Create container with loading state
            const $container = $(`
                <div class="custom-project-dashboard-container">
                    <div class="dashboard-loading">
                        <div class="text-center" style="padding: 20px;">
                            <i class="fa fa-spinner fa-spin fa-2x"></i>
                            <p>Loading project dashboard...</p>
                        </div>
                    </div>
                </div>
            `);
            
            // Insert at the top of the form
            $(frm.wrapper).find('.layout-main-section-wrapper').prepend($container);
            
            // Load dashboard
            frappe.call({
                method: "project_ui.api.get_project_dashboard",
                args: { project: frm.doc.name },
                callback: function(r) {
                    if (r.message) {
                        $container.html(r.message);
                        // Add refresh button
                        add_refresh_button(frm, $container);
                    } else {
                        $container.html('<div class="text-muted">No dashboard data available</div>');
                    }
                },
                error: function() {
                    $container.html('<div class="text-danger">Error loading dashboard</div>');
                }
            });
        });
    }
});

function add_refresh_button(frm, $container) {
    const $refresh = $(`
        <button class="btn btn-xs btn-default pull-right" 
                style="margin-top: -30px; margin-right: -10px;">
            <i class="fa fa-refresh"></i>
        </button>
    `);
    
    $refresh.click(() => {
        $container.html('<div class="text-center"><i class="fa fa-spinner fa-spin"></i></div>');
        frm.refresh();
    });
    
    $container.find('.dashboard-header').append($refresh);
}