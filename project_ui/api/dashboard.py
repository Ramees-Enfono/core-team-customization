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
        
        
        html = f"""
        <div class="custom-project-dashboard">
            <div class="dashboard-header">
                <div class="text-muted small">{project_doc.status} | {frappe.utils.format_date(frappe.utils.getdate())}</div>
            </div>
        """
        return html
        
    except Exception as e:
        frappe.log_error(f"Error in project dashboard for {project}: {str(e)}")
        return f"""
        <div class="custom-project-dashboard" style="padding: 20px; background: #fee2e2; color: #dc2626;">
            <strong>Error loading dashboard:</strong> {str(e)}
        </div>
        """