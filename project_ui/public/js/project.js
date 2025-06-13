frappe.ui.form.on('Project', {
    refresh: function (frm) {
        // Always remove the dashboard if it exists (important for switching from saved to new)
        $(frm.wrapper).find('.custom-project-dashboard-container').remove();

        // Skip loading if this is a new (unsaved) form
        if (frm.is_new()) return;

        frappe.after_ajax(() => {
            if (frm.is_new()) return; // Double-check again

            // Create new container
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

            // Inject it
            $(frm.wrapper).find('.layout-main-section-wrapper').prepend($container);

            // Call your server method
            frappe.call({
                method: "project_ui.api.dashboard.get_project_dashboard",
                args: { project: frm.doc.name },
                callback: function (r) {
                    if (r.message) {
                        $container.html(r.message);
                        $container.append(load_charts(frm));
                        $container.append(load_materials_section(frm));
                    } else {
                        $container.html('<div class="text-muted">No dashboard data available</div>');
                    }
                },
                error: function () {
                    $container.html('<div class="text-danger">Error loading dashboard</div>');
                }
            });
        });
    }
});
function load_materials_section(frm) {
    const project = frm.doc.name;

    const $materialsSection = $(`<div class="materials-section" style="margin-top: 30px; background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h4>Material Management</h4>
            <div>
                <div style="position: relative; width: 300px; display: inline-block;">
                    <input type="text" class="form-control" placeholder="Search by material name or code" style="padding-left: 30px;">
                    <i class="fa fa-search" style="position: absolute; left: 10px; top: 10px; color: #999;"></i>
                </div>
            </div>
        </div>
        <div class="materials-loading" style="text-align: center; padding: 20px;">
            <i class="fa fa-spinner fa-spin fa-2x"></i>
            <p>Loading materials data...</p>
        </div>
    </div>`);

    // New Material Request
    $materialsSection.find('.btn-new-request').click(() => {
        frappe.call({
            method: "project_ui.api.materials.create_material_request",
            args: { project },
            callback: function(r) {
                if (r.message) {
                    frappe.set_route("Form", "Material Request", r.message.name);
                }
            }
        });
    });

    // Load material list
    frappe.call({
        method: "project_ui.api.materials.get_project_materials",
        args: { project },
        callback: function(r) {
            const $content = $materialsSection.find('.materials-loading');
            $content.empty();

            if (r.message && r.message.length) {
                const materials = r.message;
                const $table = $(`<div class="table-responsive">
                    <table class="table table-bordered" style="margin-top: 15px;">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Discipline</th>
                                <th>Stock</th>
                                <th>Quantity</th>
                                <th>Assigned Project</th>
                                <th class="text-center">Block from use</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>`);
                const $tbody = $table.find('tbody');

                materials.forEach(material => {
                    const isBlocked = material.is_blocked === 1 || material.is_blocked === true || material.is_blocked === "1";

                    $tbody.append(`
                        <tr>
                            <td><a href="/app/item/${material.code}">${material.code || ''}</a></td>
                            <td>${material.name || ''}</td>
                            <td><span class="badge" style="background: #f1f1f1; padding: 5px 12px; border-radius: 20px; font-weight: 600;">${material.discipline || ''}</span></td>
                            <td>${material.stock_quantity || '0.00'}</td>
                            <td>${material.assigned || '0.00'}</td>
                            <td>${material.assigned_project || ''}</td>
                            <td class="text-center">
                                <button class="btn btn-sm btn-toggle-block btn-block-material ${isBlocked ? 'btn-success' : 'btn-outline-danger'}"
                                        data-item="${material.code}" 
                                        data-blocked="${isBlocked}">
                                    ${isBlocked ? 'Unblock' : 'Block'}
                                </button>
                            </td>
                        </tr>
                    `);
                });

                $content.append($table);

                // Filter
                $materialsSection.find('input').on('keyup', function () {
                    const searchText = $(this).val().toLowerCase();
                    $tbody.find('tr').each(function () {
                        const rowText = $(this).text().toLowerCase();
                        $(this).toggle(rowText.includes(searchText));
                    });
                });

                // Block Button
                $materialsSection.find('.btn-toggle-block').click(function () {
                const $btn = $(this);
                const item_code = $btn.data('item');
                const is_blocked = $btn.data('blocked') === true || $btn.data('blocked') === "true";
                const action = is_blocked ? 'unblock' : 'block';
                const confirm_msg = `Are you sure you want to ${action} this item?`;

                frappe.confirm(confirm_msg, () => {
                    frappe.call({
                        method: "project_ui.api.materials.toggle_item_block",
                        args: { item_code, block: !is_blocked },
                        callback: () => {
                            frappe.msgprint(__(`Item ${is_blocked ? 'Unblocked' : 'Blocked'}`));

                            // ✅ Update button UI immediately
                            $btn.data('blocked', !is_blocked);
                            $btn.toggleClass('btn-outline-danger btn-success');
                            $btn.text(!is_blocked ? 'Unblock' : 'Block');
                        }
                    });
                });
            });



            } else {
                $content.html(`
                    <div class="text-muted" style="padding: 20px;">
                        <i class="fa fa-info-circle fa-2x"></i>
                        <p>No materials found for this project</p>
                    </div>
                `);
            }
        },
        error: function () {
            $materialsSection.find('.materials-loading').html(`
                <div class="text-danger" style="padding: 20px;">
                    <i class="fa fa-exclamation-triangle fa-2x"></i>
                    <p>Error loading materials data</p>
                </div>
            `);
        }
    });

    return $materialsSection;
}




function load_charts(frm) {
    const project = frm.doc.name;
    // top row: 2 charts
    const $topGrid = $(`<div class="chart-grid-top" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 10px;
        margin-top: 20px;
    "></div>`);
    // Bottom row: 3 items (Expenses + Budget + Finance)
    const $bottomGrid = $(`<div class="chart-grid-bottom" style="
        display: grid;
        grid-template-columns: 45% 24% 30%;
        gap: 10px;
        margin-top: 20px;
    "></div>`);
    // === Chart 1: Project Progress (top left)
    frappe.call({
        method: "project_ui.api.charts.get_task_status_stacked_chart",
        args: { project },
        callback: function (res) {
            if (res.message) {
                const $card = create_chart_card("Project Progress", res.message);
                $topGrid.append($card);
            }
        }
    });

    // === Chart 2: Plan vs Actual (top right)
    frappe.call({
        method: "project_ui.api.charts.get_plan_vs_actual_chart",
        args: { project },
        callback: function (res) {
            if (res.message) {
                const $card = create_chart_card("Plan vs Actual", res.message);
                $topGrid.append($card);
            }
        }
    });
    frappe.call({
        method: "project_ui.api.charts.get_project_charts",
        args: { project },
        callback: function (res) {
            if (res.message) {
                // === Expenses — 45%
                const expenses_chart = res.message.expenses_chart;
                const $expensesCard = $(`<div"></div>`);
                $expensesCard.append(create_chart_card("Expenses", expenses_chart));
                $bottomGrid.append($expensesCard);

                // === Reserved Budget — 25%
                const budget_chart = res.message.budget_chart;
                let extra_html = "";

                if (budget_chart.reserved_value >= budget_chart.limit_value) {
                    extra_html = `
                        <div style="margin-top: 10px; color: red; font-weight: bold;">
                            ${budget_chart.limit_value.toLocaleString()} <br>
                            <small>LIMIT REACHED</small>
                        </div>
                        <div style="border-top: 2px dotted red; margin-top: 5px;"></div>
                    `;
                }

                const $budgetCard = $(`<div></div>`);
                $budgetCard.append(create_chart_card("Reserved Budget", budget_chart, extra_html));
                $bottomGrid.append($budgetCard);

                // === Finance — 30%
                frappe.call({
                    method: "project_ui.api.charts.get_finance_linkage",
                    args: { project },
                    callback: function (res) {
                        if (res.message) {
                            const { delivery_notes, expense_claims, timesheets } = res.message;

                            const getStatusColor = (status) => {
                                const colors = {
                                    "Draft": "#6c757d",
                                    "Submitted": "#007bff",
                                    "Cancelled": "#dc3545",
                                    "Approved": "#28a745"
                                };
                                return colors[status] || "#333";
                            };

                            const createItemsHTML = (items) => {
                                if (!items.length) {
                                    return `<div style="font-size: 12px; color: #888;">No records found.</div>`;
                                }
                                return items.map(item =>
                                    `<div style="padding: 5px 0; border-bottom: 1px solid #eee;">
                                        <a href="${item.link}" style="color: #007bff;">${item.id}</a>
                                        <div style="font-size: 12px;">
                                            <span style="color: ${getStatusColor(item.status)};">${item.status}</span> — ${item.time}
                                        </div>
                                    </div>`
                                ).join('');
                            };

                            const $financeCard = $(`
                                <div style="
                                    background: #fff;
                                    padding: 20px;
                                    border-radius: 12px;
                                    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
                                    font-family: 'Inter', sans-serif;
                                ">
                                    <h5 style="margin-bottom: 15px;">Linkage with Finance</h5>
                                    <div class="finance-tabs" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                        <button class="tab-btn active" data-tab="delivery" style="border: none; background: #eef; padding: 6px 10px; border-radius: 6px;">Delivery Notes</button>
                                        <button class="tab-btn" data-tab="claims" style="border: none; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">Expense Claims</button>
                                        <button class="tab-btn" data-tab="timesheets" style="border: none; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">Time Sheets</button>
                                    </div>
                                    <div class="tab-content" id="delivery" style="display: block;">
                                        ${createItemsHTML(delivery_notes)}
                                    </div>
                                    <div class="tab-content" id="claims" style="display: none;">
                                        ${createItemsHTML(expense_claims)}
                                    </div>
                                    <div class="tab-content" id="timesheets" style="display: none;">
                                        ${createItemsHTML(timesheets)}
                                    </div>
                                    <div style="margin-top: 10px; text-align: center;">
                                        <a class="view-more-link" style="font-size: 12px; color: #007bff; cursor: pointer;">View more</a>
                                    </div>
                                </div>
                            `);

                            // Tab switching
                            $financeCard.find(".tab-btn").on("click", function () {
                                const $this = $(this);
                                const tab = $this.data("tab");
                                $this.siblings().removeClass("active").css("background", "#f5f5f5");
                                $this.addClass("active").css("background", "#eef");
                                $financeCard.find(".tab-content").hide();
                                $financeCard.find(`#${tab}`).show();
                            });

                            // View more logic
                            $financeCard.find(".view-more-link").on("click", function () {
                                const activeTab = $financeCard.find(".tab-btn.active").data("tab");
                                let route = "";
                                if (activeTab === "delivery") {
                                    route = `/app/delivery-note?project=${project}`;
                                } else if (activeTab === "claims") {
                                    route = `/app/expense-claim?project=${project}`;
                                } else if (activeTab === "timesheets") {
                                    route = `/app/timesheet?parent_project=${project}`;
                                }
                                window.location.href = route;
                            });

                            $bottomGrid.append($financeCard);
                        }
                    }
                });
            }
        }
    });

    // === Wrapper to hold both grid sections
    const $wrapper = $(`<div"></div>`);
    $wrapper.append($topGrid);
    $wrapper.append($bottomGrid);

    return $wrapper;
}

function create_chart_card(title, chart_data, extra_content = "") {
    const $card = $(`<div style="
        background: #fff;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.05);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    ">
        <h5 style="margin-bottom: 15px;">${title}</h5>
        <div class="chart-container" style="height: 280px; width: 100%; min-width: 200px;"></div>
        ${extra_content}
    </div>`);

    const $canvas = $card.find(".chart-container");

    // Delay rendering to ensure layout is fully calculated
    setTimeout(() => {
        render_chart($canvas, chart_data);
    }, 50);

    return $card;
}

function render_chart($parent, chart_data) {
    try {
        const data = chart_data.data || chart_data;

        // Validate structure
        if (!data.labels || !data.datasets || !data.datasets.length) {
            $parent.html(`<p class="text-muted">No chart data available</p>`);
            return;
        }

        // Fix invalid/null/empty labels
        data.labels = data.labels.map(label => {
            if (!label || typeof label !== 'string' || !label.trim()) {
                return "Unknown";
            }
            return label;
        });

        // Sanitize values
        data.datasets = data.datasets.map(dataset => ({
            ...dataset,
            values: (dataset.values || []).map((v) => {
                const num = Number(v);
                return (isNaN(num) || !isFinite(num)) ? 0 : num;
            })
        }));

        new frappe.Chart($parent[0], {
            title: chart_data.title || '',
            data: data,
            type: chart_data.type || 'bar',
            barOptions: chart_data.barOptions || {},
            colors: chart_data.colors || [],
        });
    } catch (e) {
        $parent.html(`<p class="text-danger">Chart failed to render</p>`);
    }
}

