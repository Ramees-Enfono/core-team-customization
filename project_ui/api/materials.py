import frappe
from frappe.model.mapper import get_mapped_doc

@frappe.whitelist()
def get_project_materials(project):
    items = frappe.db.sql("""
        SELECT 
            i.item_code AS code,
            it.item_name AS name,
            it.custom_discipline AS discipline,
            SUM(i.stock_qty) AS stock_quantity,
            SUM(i.qty) AS assigned,
            MAX(CASE WHEN it.custom_block_from_use = 1 THEN 1 ELSE 0 END) AS is_blocked,
            mr.custom_project AS assigned_project
        FROM `tabMaterial Request Item` i
        JOIN `tabItem` it ON it.name = i.item_code
        JOIN `tabMaterial Request` mr ON mr.name = i.parent
        WHERE mr.custom_project = %s
        GROUP BY i.item_code, mr.custom_project
    """, project, as_dict=True)

    return items


@frappe.whitelist()
def toggle_item_block(item_code, block: bool):
    if not item_code:
        frappe.throw("Item code is required")

    item = frappe.get_doc("Item", item_code)
    item.custom_block_from_use = 1 if frappe.utils.cint(block) else 0
    item.save(ignore_permissions=True)

    status = "blocked" if block else "unblocked"
    return {
        "status": "success",
        "message": f"Item {item_code} {status} successfully"
    }
