# project_ui/api/charts.py

import frappe
from frappe import _
from frappe.utils import format_datetime
import calendar
from frappe.utils import getdate
from collections import defaultdict


@frappe.whitelist()
def get_task_status_stacked_chart(project):
    sections = frappe.db.get_all("Task", filters={"project": project}, distinct=True, pluck="custom_discipline")

    chart_data = {
        "labels": [],
        "datasets": [
            {"name": "Completed", "values": []},
            {"name": "Adherence", "values": []},
            {"name": "Overdue", "values": []},
        ]
    }

    for section in sections:
        chart_data["labels"].append(section)

        total = frappe.db.count("Task", filters={"project": project, "custom_discipline": section})
        completed = frappe.db.count("Task", filters={"project": project, "custom_discipline": section, "status": "Completed"})
        overdue = frappe.db.count("Task", filters={"project": project, "custom_discipline": section, "status": "Overdue"})
        adherence = total - completed - overdue

        if total > 0:
            chart_data["datasets"][0]["values"].append(round((completed / total) * 100, 2))
            chart_data["datasets"][1]["values"].append(round((adherence / total) * 100, 2))
            chart_data["datasets"][2]["values"].append(round((overdue / total) * 100, 2))
        else:
            for ds in chart_data["datasets"]:
                ds["values"].append(0)

    return {
        "type": "bar",
        "data": chart_data,
        "barOptions": {"stacked": True, "horizontal": True},
        "colors": ["#1E2F97", "#6C9BE8", "#FFB3B3"],
    }


@frappe.whitelist()
def get_plan_vs_actual_chart(project):
    # Step 1: Get project planned cost
    project_doc = frappe.get_doc("Project", project)
    planned_cost = float(project_doc.estimated_costing or 0)

    # Step 2: Initialize monthly actual costs
    monthly_actual = defaultdict(float)

    # Step 3: Fetch actuals from 4 sources
    def update_monthly_costs(data, month_field="month_number", total_field="total"):
        for row in data:
            try:
                month = int(row.get(month_field, 0) or 0)
                total = float(row.get(total_field, 0) or 0)
                if 1 <= month <= 12:
                    monthly_actual[month] += total
            except Exception:
                continue

    # Expense Claims
    expense_data = frappe.db.sql("""
        SELECT MONTH(posting_date) AS month_number,
               SUM(total_claimed_amount) AS total
        FROM `tabExpense Claim`
        WHERE project = %s
        GROUP BY month_number
    """, (project,), as_dict=True)
    update_monthly_costs(expense_data)

    # Purchase Invoices
    purchase_data = frappe.db.sql("""
        SELECT MONTH(posting_date) AS month_number,
               SUM(base_rounded_total) AS total
        FROM `tabPurchase Invoice`
        WHERE project = %s AND docstatus = 1
        GROUP BY month_number
    """, (project,), as_dict=True)
    update_monthly_costs(purchase_data)

    # Timesheets
    timesheet_data = frappe.db.sql("""
        SELECT MONTH(from_time) AS month_number,
               SUM(costing_amount) AS total
        FROM `tabTimesheet Detail`
        WHERE parent IN (
            SELECT name FROM `tabTimesheet`
            WHERE parent_project = %s
        )
        GROUP BY month_number
    """, (project,), as_dict=True)
    update_monthly_costs(timesheet_data)

    # Material Issues
    stock_data = frappe.db.sql("""
        SELECT MONTH(se.posting_date) AS month_number,
               SUM(sed.amount) AS total
        FROM `tabStock Entry Detail` sed
        JOIN `tabStock Entry` se ON se.name = sed.parent
        WHERE se.project = %s AND se.purpose = 'Material Issue'
        GROUP BY month_number
    """, (project,), as_dict=True)
    update_monthly_costs(stock_data)

    # Step 4: Prepare chart values
    month_numbers = sorted(monthly_actual.keys())
    labels = [calendar.month_abbr[m] for m in month_numbers]
    actual_costs = [round(float(monthly_actual.get(m, 0)), 2) for m in month_numbers]

    month_count = len(month_numbers)
    planned_costs = []
    if month_count > 0:
        per_month = round(planned_cost / month_count, 2)
        planned_costs = [per_month] * month_count

    return {
        "type": "axis-mixed",
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "name": "Actual cost",
                    "values": actual_costs,
                    "type": "line",
                    "area": True
                },
                {
                    "name": "Planned cost",
                    "values": planned_costs,
                    "type": "line",
                    "area": True
                }
            ]
        },
        "colors": ["#2e3cbf", "#44e26c"]
    }


@frappe.whitelist()
def get_project_charts(project=None):
    reserved = get_reserved_budget(project)
    usage = get_budget_usage(project)

    return {
        "expenses_chart": get_expenses_chart(project),
        "budget_chart": get_budget_chart(reserved, usage),
        "budget_usage": usage,
        "reserved_budget": reserved
    }


def get_expenses_chart(project=None):
    labels = [calendar.month_abbr[i] for i in range(1, 13)]

    manpower = get_monthly_sum("Timesheet", "total_costing_amount", "start_date", "parent_project", project)
    material = get_monthly_sum("Purchase Invoice Item", "amount", "posting_date", "project", project)
    other = get_monthly_sum("Expense Claim", "total_claimed_amount", "posting_date", "project", project)

    return {
        "type": "axis-mixed",
        "data": {
            "labels": labels,
            "datasets": [
                {"name": "Manpower cost", "type": "line", "values": manpower},
                {"name": "Material cost", "type": "line", "values": material},
                {"name": "Other cost", "type": "line", "values": other}
            ]
        },
        "colors": ["#9b59b6", "#1abc9c", "#34495e"]
    }


def get_monthly_sum(doctype, fieldname, date_field, project_field, project):
    monthly_values = [0] * 12

    if not project:
        return monthly_values

    # Special handling for Purchase Invoice Item
    if doctype == "Purchase Invoice Item":
        query = f"""
            SELECT 
                MONTH(parent_tab.posting_date) as month,
                SUM(item.{fieldname}) as total
            FROM `tab{doctype}` AS item
            JOIN `tabPurchase Invoice` AS parent_tab
            ON item.parent = parent_tab.name
            WHERE item.{project_field} = %s
            AND parent_tab.docstatus = 1
            GROUP BY MONTH(parent_tab.posting_date)
        """
    else:
        query = f"""
            SELECT 
                MONTH({date_field}) as month,
                SUM({fieldname}) as total
            FROM `tab{doctype}`
            WHERE {project_field} = %s
            AND docstatus = 1
            GROUP BY MONTH({date_field})
        """

    results = frappe.db.sql(query, (project,), as_dict=True)

    for row in results:
        try:
            month_index = int(row.month) - 1
            if 0 <= month_index < 12:
                monthly_values[month_index] = round(float(row.total or 0), 2)
        except:
            continue

    return monthly_values


def get_reserved_budget(project):
    return float(frappe.db.get_value("Project", project, "estimated_costing") or 0)


def get_budget_usage(project):
    def fetch_total(doctype, amount_field):
        result = frappe.db.sql(f"""
            SELECT SUM({amount_field}) as total
            FROM `tab{doctype}`
            WHERE project = %s AND docstatus = 1
        """, (project,), as_dict=True)
        return float(result[0].total or 0) if result and result[0].total else 0

    manpower = frappe.db.sql("""
        SELECT SUM(total_costing_amount) AS total
        FROM `tabTimesheet`
        WHERE parent_project = %s AND docstatus = 1
    """, (project,), as_dict=True)[0].total or 0

    material = fetch_total("Purchase Invoice Item", "amount")
    other = fetch_total("Expense Claim", "total_claimed_amount")

    return float(manpower) + material + other


def get_budget_chart(reserved, usage):
    return {
        "type": "bar",
        "data": {
            "labels": ["Budget", "Used"],
            "datasets": [
                {"name": "Amount", "values": [round(reserved, 2), round(usage, 2)]}
            ]
        },
        "colors": ["#3498db", "#e67e22"],
        "barOptions": {"spaceRatio": 0.5}
    }


@frappe.whitelist()
def get_finance_linkage(project):
    def get_items(doctype, project_field):
        filters = {project_field: project}
        docs = frappe.get_all(doctype,
            filters=filters,
            fields=["name", "status", "modified"],
            order_by="modified desc",
            limit=4
        )
        return [
            {
                "id": doc.name,
                "status": doc.status,
                "time": format_datetime(doc.modified, "hh:mm dd/MM/yy"),
                "link": f"/app/{doctype.lower().replace(' ', '-')}/{doc.name}"
            }
            for doc in docs
        ]

    return {
        "delivery_notes": get_items("Delivery Note", "project"),
        "expense_claims": get_items("Expense Claim", "project"),
        "timesheets": get_items("Timesheet", "parent_project")
    }
