import frappe
from frappe.utils import flt, cint

@frappe.whitelist()
def get_project_dashboard(project):
    try:
        # Get project details
        project_doc = frappe.get_doc("Project", project)
        
        # Task metrics
        total_tasks = frappe.db.count('Task', {'project': project})
        completed_tasks = frappe.db.count('Task', {'project': project, 'status': 'Completed'})
        progress = round((completed_tasks / total_tasks) * 100) if total_tasks else 0
        
        # Time metrics
        hours_logged = flt(frappe.db.sql("""
            SELECT SUM(hours) FROM `tabTimesheet Detail` 
            WHERE parent IN (
                SELECT name FROM `tabTimesheet` WHERE project = %s AND docstatus = 1
            )
        """, (project,))[0][0] or 0)
        
        # Budget metrics - using amount instead of base_amount
        budget_allocated = flt(project_doc.estimated_costing)
        actual_expense = flt(frappe.db.sql("""
            SELECT SUM(amount) FROM `tabExpense Claim Detail`
            WHERE parent IN (
                SELECT name FROM `tabExpense Claim` WHERE project = %s AND docstatus = 1
            )
        """, (project,))[0][0] or 0)
        
        html = f"""
        <div class="custom-project-dashboard">
            <div class="dashboard-header">
                <h3>{project_doc.project_name}</h3>
                <div class="text-muted small">{project_doc.status} | {frappe.utils.format_date(frappe.utils.getdate())}</div>
            </div>
            
            <div class="dashboard-metrics">
                <div class="metric-card">
                    <div class="metric-value">{progress}%</div>
                    <div class="metric-label">Progress</div>
                    <div class="progress">
                        <div class="progress-bar" style="width: {progress}%"></div>
                    </div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-value">{completed_tasks}/{total_tasks}</div>
                    <div class="metric-label">Tasks</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-value">{hours_logged:.1f}</div>
                    <div class="metric-label">Hours Logged</div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-value">{frappe.utils.fmt_money(actual_expense)}</div>
                    <div class="metric-label">Actual Cost</div>
                    <div class="text-small">{frappe.utils.fmt_money(budget_allocated)} budget</div>
                </div>
            </div>
        </div>
        
        <style>
        .custom-project-dashboard {{ 
            margin-bottom: 20px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            background: white;
        }}
        .dashboard-header {{ margin-bottom: 15px; }}
        .dashboard-metrics {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }}
        .metric-card {{
            padding: 15px;
            background: #f9fafb;
            border-radius: 8px;
            text-align: center;
        }}
        .metric-value {{
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 5px;
        }}
        .metric-label {{
            color: #6b7280;
            margin-bottom: 10px;
        }}
        .progress {{
            height: 6px;
            background: #e5e7eb;
            border-radius: 3px;
            overflow: hidden;
        }}
        .progress-bar {{
            height: 100%;
            background: #3b82f6;
        }}
        </style>
        """
        return html
        
    except Exception as e:
        frappe.log_error(f"Error in project dashboard for {project}: {str(e)}")
        return f"""
        <div class="custom-project-dashboard" style="padding: 20px; background: #fee2e2; color: #dc2626;">
            <strong>Error loading dashboard:</strong> {str(e)}
        </div>
        """