# Aiven Rental App User Manual

## Authoritative Workflow: Rental Order Line Items

For line-item questions, use the workflow in the "Detailed Workflow: Add Line Items to a Quote or Rental Order" section.
The implemented line-item flow is: add line item, choose equipment type, open Booked Dates, enter Start and End, choose
pricing Period and Rate, select a Unit when the status requires it, and use Actual dates only when the equipment actually
goes out with the customer or returns. Unit selection is locked in `quote`, `quote_rejected`, and `requested`. In
`reservation`, units can be assigned but are not required. In `ordered`, a non-rerent line can be saved as TBD with no
unit, but a unit or valid bundle is required before recording actual pickup. In `received` and `closed`, non-rerent lines
require a unit or valid bundle. Quantity entry is not part of the normal rental-order line-item workflow; each line represents
one unit, one bundle, or one re-rent item.



This version was generated from the original PDF and adds explicit image file references after every screenshot caption. Use these `Image file:` references for AI/file-search workflows that need to connect written instructions to screenshot assets.

Verification note: this manual was checked against the implemented public pages, browser JavaScript, and backend
validation used by the app. Where behavior depends on saved data, QuickBooks connection, configured document
categories, customer-link settings, or clean map/location data, the manual calls that out instead of assuming the data will
always be present.

Implementation note about locations and asset tracking: the app stores two location values for an asset. `Base location`
is the yard/branch/home location selected in the asset form. `Current location` is the asset's present physical location
when that differs from, or needs to be tracked separately from, the base. If Current location is blank, the UI treats the
asset as "Same as base location"; the database does not need to copy the base id into the current-location field for that
display to work. Current-location map pins, rental order site pins, drop-off locations, customer-link unit pins, and import
map pins create non-base location records so they can be used for tracking without cluttering base-yard selectors. The
normal Locations list and base-location dropdowns show base locations by default.

## Screenshot Index

| Page | Screenshot | Image file |
|---:|---|---|
| 4 | Landing Page | `screenshots/p04_01_landing_page.png` |
| 5 | Login | `screenshots/p05_01_login.png` |
| 6 | Work Bench - Timeline View | `screenshots/p06_01_work_bench_timeline_view.png` |
| 7 | Work Bench - Stages View | `screenshots/p07_01_work_bench_stages_view.png` |
| 8 | Work Bench - Pick/Return View | `screenshots/p08_01_work_bench_pick_return_view.png` |
| 9 | Dashboard - Map View | `screenshots/p09_01_dashboard_map_view.png` |
| 10 | Dashboard - Availability and Utilization View | `screenshots/p10_01_dashboard_availability_and_utilization_view.png` |
| 11 | Quotes Table | `screenshots/p11_01_quotes_table.png` |
| 12 | Rental Order Table | `screenshots/p12_01_rental_order_table.png` |
| 13 | Rental Order / Quote Detail Page (1) | `screenshots/p13_01_rental_order_quote_detail_page_1.png` |
| 14 | Rental Order / Quote Detail Page (2) | `screenshots/p14_01_rental_order_quote_detail_page_2.png` |
| 14 | Rental Order / Quote Detail Page (3) | `screenshots/p14_02_rental_order_quote_detail_page_3.png` |
| 16 | Rental Order / Quote - Pick Site Address Popup | `screenshots/p16_01_rental_order_quote_pick_site_address_popup.png` |
| 17 | Rental Order / Quote - Additional Fee Popup | `screenshots/p17_01_rental_order_quote_additional_fee_popup.png` |
| 18 | Rental Order / Quote - Before/After Documents Popup | `screenshots/p18_01_rental_order_quote_before_after_documents_popup.png` |
| 19 | Rental Order / Quote - Booked Dates Popup | `screenshots/p19_01_rental_order_quote_booked_dates_popup.png` |
| 20 | Rental Order - Actual Dates Popup (1) | `screenshots/p20_01_rental_order_actual_dates_popup_1.png` |
| 20 | Rental Order - Actual Dates Popup (2) | `screenshots/p20_02_rental_order_actual_dates_popup_2.png` |
| 21 | Rental Order - Add Pause Period | `screenshots/p21_01_rental_order_add_pause_period.png` |
| 22 | Rental Order / Quote - Attachments Drawer | `screenshots/p22_01_rental_order_quote_attachments_drawer.png` |
| 23 | Rental Order / Quote - History Page | `screenshots/p23_01_rental_order_quote_history_page.png` |
| 24 | Rental Order / Quote - Monthly Charges | `screenshots/p24_01_rental_order_quote_monthly_charges.png` |
| 25 | Rental Order / Quote - Customer Update Page | `screenshots/p25_01_rental_order_quote_customer_update_page.png` |
| 26 | Customer Link Page for Rental Order / Quote (1) | `screenshots/p26_01_customer_link_page_for_rental_order_quote_1.png` |
| 26 | Customer Link Page for Rental Order / Quote (2) | `screenshots/p26_02_customer_link_page_for_rental_order_quote_2.png` |
| 27 | Monthly Charges Page | `screenshots/p27_01_monthly_charges_page.png` |
| 28 | Work Orders Table View | `screenshots/p28_01_work_orders_table_view.png` |
| 29 | Work Order Detail View (1) | `screenshots/p29_01_work_order_detail_view_1.png` |
| 29 | Work Order Detail View (2) | `screenshots/p29_02_work_order_detail_view_2.png` |
| 30 | Work Order Detail View (3) | `screenshots/p30_01_work_order_detail_view_3.png` |
| 31 | Parts | `screenshots/p31_01_parts.png` |
| 32 | Assets Table View | `screenshots/p32_01_assets_table_view.png` |
| 33 | Asset Detail View | `screenshots/p33_01_asset_detail_view.png` |
| 34 | Asset Detail - Current Location Map Popup | `screenshots/p34_01_asset_detail_current_location_map_popup.png` |
| 35 | Asset Detail - Bundle Popup | `screenshots/p35_01_asset_detail_bundle_popup.png` |
| 36 | Equipment Page Table View | `screenshots/p36_01_equipment_page_table_view.png` |
| 37 | Equipment Detail Page | `screenshots/p37_01_equipment_detail_page.png` |
| 38 | Location Table View | `screenshots/p38_01_location_table_view.png` |
| 38 | Location Detail View (1) | `screenshots/p38_02_location_detail_view_1.png` |
| 39 | Location Detail View (2) | `screenshots/p39_01_location_detail_view_2.png` |
| 40 | Purchase Order Table View | `screenshots/p40_01_purchase_order_table_view.png` |
| 41 | Purchase Order Detail View | `screenshots/p41_01_purchase_order_detail_view.png` |
| 42 | Sales Order Detail View | `screenshots/p42_01_sales_order_detail_view.png` |
| 43 | Vendor Detail View | `screenshots/p43_01_vendor_detail_view.png` |
| 44 | Customer Table View | `screenshots/p44_01_customer_table_view.png` |
| 45 | Customer QuickBooks Online Sync | `screenshots/p45_01_customer_quickbooks_online_sync.png` |
| 46 | Customer Detail View (1) | `screenshots/p46_01_customer_detail_view_1.png` |
| 47 | Customer Detail View (2) | `screenshots/p47_01_customer_detail_view_2.png` |
| 48 | Customer Detail - Extra Drawers | `screenshots/p48_01_customer_detail_extra_drawers.png` |
| 49 | Sales People Table View | `screenshots/p49_01_sales_people_table_view.png` |
| 50 | Sales People Detail View | `screenshots/p50_01_sales_people_detail_view.png` |

---

## Page 1

Aiven Rental App User Manual
Page 1
Aiven Rental App User Manual
Step-by-step guide for the main app pages, actions, popups, drawers, and workflows
Prepared from the screenshot guide provided for the rental Aiven app. Settings and account pages are excluded.
Generated: 2026-04-25

---

## Page 2

Aiven Rental App User Manual
Page 2
Contents
G
Purpose, scope, and quick reference
G
Landing and login
G
Work Bench
G
Dashboard
G
Quotes and rental orders
G
Customer-facing order links
G
Monthly charges
G
Work orders and parts
G
Assets, equipment, and locations
G
Purchase orders, sales orders, and vendors
G
Customers and QuickBooks sync
G
Sales people
G
Screenshot-based page reference

---

## Page 3

Aiven Rental App User Manual
Page 3
1. Purpose, Scope, and Operating Rules
Purpose and scope
This manual explains how to complete the main actions inside the Aiven Rental app using the pages and popups shown in
the screenshot guide. It is written for a new user who needs to operate the system without being shown each screen in
person.
The guide covers pages accessible from the side navigation and the sub-pages, drawers, and popups shown in the
screenshots. Settings and account pages are intentionally excluded, as requested.
This manual describes the fields and workflow implemented in the app. The rental order form includes customer and sales,
order contacts, pickup/drop-off, rental line items, pricing summary, QuickBooks documents, rental information, extras,
notes, attachments, terms, customer links, history, monthly charges, and PDF actions. The default rental information fields
are site name, site address, site access information / pin, critical assets and locations on site, monitoring personnel,
general notes, emergency contacts, emergency contact instructions, site contacts, notification circumstances, and hours of
coverage required. Directions exists as a supported rental-information field and is hidden by default.
How to read this manual
Each section starts with the goal of the page, then gives click-by-click instructions, mandatory fields, optional fields, and the
main rules to remember.
Booked dates are treated as planned/scheduled dates. Actual dates are treated as the real field dates and are used after a
rental order starts moving through operations. Unit selection is locked in `quote`, `quote_rejected`, and `requested`;
`reservation` can assign units but does not require them. Actual pickup cannot be recorded until the line has a selected
unit or valid bundle.
Location behavior is driven by saved asset, order, and location data. A map marker appears only when the relevant base
or current location has latitude/longitude coordinates. If a current-location coordinate is missing, map views fall back to
the asset's base location when the base is geocoded. If both are missing, the unit can still exist and be rented, but it will
not plot on the map.
A screenshot is included beside or below each documented page, popup, or drawer so users can visually match the
instructions to the app.
Quick Reference
Workflow
Where to start
Main action
Create a rental order
Rental Orders > New RO
Select customer, fill order details, add line items, add booked
dates, save.
Create a quote
Quotes > New Quote
Build the proposed rental in the same structure as an RO, then
keep it as a quote until ready.
Pick or return equipment
Work Bench > Pick/Return or
Rental Order detail
Open the order, add actual pickup/return dates, then complete
movement actions.
Send customer update link
Rental Order/Quote detail >
Customer Update
Generate or copy the link and send it to the customer.
Create a customer
Customers > New Customer
Company name is required for standalone customers; branch customers require parent customer and branch name. Add
contacts, address, sales person, deposit flag, special pricing, and save.
Create an asset
Assets > Add Equipment/Asset
Asset type, model name, and serial number are required; add
status and location.
Create work order
Work Orders > New Work Order
Select one or more units, add service details, due date, parts/labor,
then save.
Create part
Parts > Add Part
Part number is required; add description, unit of measure, and unit
cost.
Create location
Locations > Add Location
Location name is required; add address and yard/site details.
Create salesperson
Sales People > Add Sales
Person
Name is required; add email, phone, and optional photo.
General save rule: if you make a change on a detail page or popup, save or apply that popup first, then save the parent
record when the parent page has unsaved changes. The rental order page warns before leaving with unsaved changes and
offers Stay, Leave without saving, or Save and leave.

---

## Page 4

Aiven Rental App User Manual
Page 4
2. Landing and Login
Landing Page
Purpose: Use the landing page as the public entry point before a user logs into the rental management system.
How to use it
1
Open the app URL in a browser.
2
Review the public landing page content.
3
Click the login or sign-in option to move to the secure app login screen.
4
Use the login/sign-in entry point to open the secure app.
Mandatory information / rules
G
No operational data is entered on this page.
Optional but useful information
G
Use this page for first-time orientation, demos, or to direct users toward the login flow.
Important notes
G
The landing page is not where rental orders, customers, assets, or work orders are managed.
Screenshot: Landing Page

Image file: `screenshots/p04_01_landing_page.png`


Login
Purpose: Sign into the app before accessing company rental data.
How to use it
1
Navigate to the login page.

---

## Page 5

Aiven Rental App User Manual
Page 5
2
Enter the email address or username assigned to your account.
3
Enter your password.
4
Click the login/sign-in button.
5
After successful login, use the side navigation to move between operations, inventory, people, and reporting pages.
Mandatory information / rules
G
Valid login credentials are required.
Optional but useful information
G
The login request requires email and password.
Important notes
G
Company user authentication is required before app data pages load.
Screenshot: Login

Image file: `screenshots/p05_01_login.png`



---

## Page 6

Aiven Rental App User Manual
Page 6
3. Work Bench
The Work Bench is the operations board. Use it to see what needs attention, what is scheduled, what is going out or
coming back, and which orders are moving through the rental lifecycle. The page has three working views: Timeline,
Stages, and Pick/Return. The date, status, and search controls are shared across the views; Group by, Closest dates
first, and Ending <72h are Timeline-focused controls. Each view answers a different operational question.
Common Work Bench controls and behavior
G
Start controls the first day in the visible date range. Today resets Start to the current local date.
G
Days controls the size of the date window. The current options are 14, 21, 30, and 60 days.
G
Group by affects the Timeline view. It can group bars by Equipment unit, Equipment type, Customer, or Pickup location.
G
Closest dates first sorts the Timeline rows by the start or end date closest to now. The choice is saved in browser local
storage so the Work Bench remembers it.
G
Status checkboxes decide which order statuses are requested from the server. Requested, Reservation, and Ordered are
checked by default. Received, Closed, and Quote are unchecked by default.
G
If all status checkboxes are cleared, the Work Bench sends no status filter. In the current implementation that means the
server can return all statuses, not "no statuses." Rejected statuses are still filtered out in the Work Bench UI.
G
Search checks document number, external contract number/customer PO where available, customer, pickup location, equipment
type, equipment unit, dates, salesperson in stage data, and logistics/equipment text in Pick/Return.
G
Timeline, Stages, and Pick/Return are selected with the view toggle. The selected view is saved in browser local storage.
G
New RO opens a new rental order form with status `reservation` and source `workbench`.
G
Keyboard shortcuts are available in the Work Bench: `n` opens New RO, `/` focuses Search, and Escape closes the timeline
menu or tooltip.
Work Bench - Timeline View
Purpose: Plan and monitor active rental activity over time. The timeline view is useful for seeing where orders fall across a
date range and spotting upcoming pickups, returns, and conflicts.
How to use it
1
Click Work Bench in the side navigation.
2
Choose the Timeline view.
3
Set the date window or horizon you want to review.
4
Use the Work Bench filters, search, and view controls to narrow the board.
5
Click an order or timeline item to open its rental order detail page.
6
Use quick actions such as New RO or Ending <72h when you need to create a new rental order or focus on orders ending
soon.
What the Timeline shows
G
The Timeline is built from rental order line items that overlap the selected date range.
G
For statuses `ordered`, `received`, and `closed`, the Timeline uses actual pickup/delivery (`fulfilled_at`) as the start
when present. If there is no actual pickup/delivery date, it falls back to the booked start date.
G
For `ordered` lines, the Timeline uses actual return when present. If the line has not been returned, it uses the later of
the booked end date or the current time. This is why an overdue open ordered line can continue to stretch through today
instead of stopping at the old booked return date.
G
For `received` and `closed` lines, the Timeline uses actual return when present and booked end otherwise.
G
For `requested`, `reservation`, and `quote` lines, the Timeline uses booked start and booked end.
G
Returned assignments are hidden from the Timeline and KPI counts by the front-end filter. Received/closed orders can still
appear in Stages, but a line assignment with a return date is removed from the active Timeline view.
G
Rejected statuses are filtered out of the Work Bench after loading.
G
The Timeline currently loads assignments through a customer join. Demand-only orders that were saved without a customer
may not appear in the Timeline even though they exist elsewhere in the app.
Timeline grouping
G
Group by Equipment unit creates one row per assigned unit with visible activity. Empty asset rows are hidden for scale.
Unassigned/TBD line items appear in a separate row named by equipment type with `TBD`.
G
Group by Equipment type creates one row per equipment type and de-duplicates by line item. If multiple units are assigned
to the same line, the bar label can show a multiplier such as `x2`.
G
Group by Customer creates one row per customer and de-duplicates by order. The bar quantity represents unique assigned
units on that order.
G
Group by Pickup location creates one row per pickup location and de-duplicates by order. Orders without a pickup location
group under No pickup location.
G
Rows are normally sorted alphabetically by their group label. When Closest dates first is on, the rows are sorted by the
nearest useful start/end date to now.
Timeline colors and visual signals
G
Blue bar = Requested.
G
Yellow/gold bar = Reservation.
G
Green bar = Ordered.
G
Purple bar = Received.
G
Gray/slate bar = Closed.
G
Pale gray bar = Quote or other status.
G
Orange gradient on the right side of a bar = Ending soon. By default, ending soon means an unreturned ordered line ending
within the next 2 days. When the Ending <72h quick filter is active, the active ending window becomes 3 days.
G
Red pulsing bar = Overdue. This applies to an ordered line that has no actual return and whose raw booked return/end date
is in the past.
G
Small dark bell/dot = ordered line ending within 48 hours when no ending badge is shown.
G
Dark inset outline = due today or earlier based on the line's end date.
G
A long bar, currently 21 days or more, becomes slightly shorter and shows a duration label such as `23d`.
G
Very short bars become compact. The document number label is moved outside the bar so it remains readable.
G
The current day is highlighted in the date header and the Timeline track. Weekends have a subtle background shade, and
Mondays have a stronger divider.
Timeline actions
G
Hover a bar to see document number, status, customer, pickup location, equipment type, unit, start, return, and an
overdue/ending warning when applicable.
G
Click a bar to open the rental order.
G
Right-click a bar to open the Timeline menu. The menu supports Open order, Open in new tab, Copy document #, Copy
customer, and Copy dates.
G
For Timeline rows grouped by Equipment unit or Equipment type, ordered and reservation bars show a right-edge handle.
Dragging the handle attempts to reschedule the line item's return/end date. The new end time is rounded to the nearest 30
minutes and the user must confirm before saving.
G
Drag-rescheduling only works for Reservation and Ordered line items with assigned inventory. Customer and Pickup location
grouping do not show the drag handle.
G
If drag-rescheduling would overlap another requested, reservation, or ordered line for the same unit, the app opens a
Conflict modal and does not save the new end date.
G
When a return/end date is changed from the Timeline, the app recomputes the rental order's monthly recurring values.
Work Bench KPI cards
G
Active now counts unreturned `ordered` assignments whose start is before or equal to now and whose end is after or equal
to now.
G
Starting soon counts `requested`, `reservation`, and `ordered` assignments whose start is between now and the active
ending window. The default window is 2 days; Ending <72h changes the window to 3 days while active.
G
Ending soon counts unreturned `ordered` assignments ending within the active ending window.
G
Overdue counts unreturned `ordered` assignments whose raw booked end is before now.
G
Reservations counts `reservation` and `requested` assignments in the currently filtered assignment list.
G
The Work Bench loads and displays assignment counts. An order with multiple line items or multiple units can count more
than once in these KPI cards.
Ending <72h behavior
G
Ending <72h switches the Work Bench back to Timeline view, filters the visible assignments to ordered lines that are
already overdue or ending within the next 72 hours, and changes the ending-soon calculation window to 3 days.
G
Turning Ending <72h off restores the normal Timeline assignment list and the default 2-day ending-soon window.
Mandatory information / rules
G
No fields are mandatory just to view the timeline.
Optional but useful information
G
Date window, grouping, status filters, and search are optional tools for narrowing the board.
Important notes
G
Timeline is best for planning. For physical movement of equipment, use Pick/Return or the rental order actual dates
workflow.
G
The Timeline is not a full asset table. It hides empty units and returned assignments so dispatchers can focus on active
or upcoming work.
G
If an expected item is missing, check the status filters, date range, customer on the order, line start/end dates, actual
pickup/return dates, and whether the line has already been returned.
Screenshot: Work Bench - Timeline View

Image file: `screenshots/p06_01_work_bench_timeline_view.png`



---

## Page 7

Aiven Rental App User Manual
Page 7
Work Bench - Stages View
Purpose: Track rental orders by operational stage so staff can see what needs quoting, preparing, picking, delivering,
returning, or closing.
How to use it
1
Open Work Bench from the side navigation.
2
Select Stages.
3
Review the columns or stage groups displayed on screen.
4
Use the search and status filters to narrow the displayed orders.
5
Click an order card or row to open the rental order.
6
Update the rental order from its detail page when the order stage needs to change.
What the Stages view shows
G
Stages view loads rental orders whose overall line-item rental period overlaps the selected date range. It uses the
order's minimum booked line start and maximum booked line end for the row dates.
G
The columns are Request, Quote, Reservation, Order, Received, and Closed.
G
Request contains status `requested`.
G
Quote contains status `quote`.
G
Reservation contains status `reservation`.
G
Order contains status `ordered`.
G
Received contains status `received`.
G
Closed contains status `closed`.
G
Rejected statuses are filtered out and do not get their own stage column.
G
Each stage row shows Doc #, Customer, Start, and End. Clicking a row opens the rental order.
G
The number beside each stage heading is the count of rows currently visible in that stage after search filtering.
G
Rows inside each stage are sorted by nearest relevant date. For ordered orders that have already started, received
orders, and closed orders, the sort prefers the end date. For reservations in the past, the start is treated as now so old
reservations do not sort far away by their stale start date.
G
Search in Stages checks document number, status, customer, customer PO/external contract number, salesperson, pickup
location, start date, and end date.
G
The status checkboxes affect which orders are requested. If a stage is empty, check both the date window and the status
checkbox for that stage.
Mandatory information / rules
G
No mandatory fields are required to view the stage board.
Optional but useful information
G
Use grouping and filters to make the board useful for dispatch, sales, or operations.
Important notes
G
Stages should reflect the real workflow. Avoid moving an order forward unless required information, dates, and line items
are complete.
G
Stages view is an order-level view, not a unit-level view. It is useful for workflow state; use Timeline or Pick/Return
when the question is about units moving on a specific day.
G
Changing stage/status is done inside the rental order. The Stages view opens orders but does not directly change status.
Screenshot: Work Bench - Stages View

Image file: `screenshots/p07_01_work_bench_stages_view.png`


Work Bench - Pick/Return View
Purpose: Focus on equipment that needs to be picked up, delivered, returned, or otherwise moved.

---

## Page 8

Aiven Rental App User Manual
Page 8
How to use it
1
Open Work Bench.
2
Choose Pick/Return.
3
Use Start, Days, status checkboxes, and Search to narrow the Pick/Return list. Group by, Closest dates first, and Ending
<72h are Timeline-focused controls; Ending <72h switches the page back to Timeline.
4
Find the order or unit that needs action.
5
Open the rental order to review site address, equipment, contact, and logistics information.
6
Record actual dates when the work has happened, then complete the relevant pickup or return action.
What the Pick/Return view shows
G
Pick/Return loads rental orders whose overall line-item rental period overlaps the selected date range, then breaks each
order into day rows based on line-item out and back dates.
G
Equipment out uses actual pickup/delivery (`fulfilledAt`) when present. If actual pickup/delivery is blank, it uses the
booked start date.
G
Equipment back uses actual return (`returnedAt`) when present. If actual return is blank, it uses the booked end date.
G
If the same order has equipment going out and coming back on the same day, the row can show both Equipment out and
Equipment back.
G
If different lines on the same order move on different days, the Work Bench creates separate Pick/Return rows for those
days.
G
Rows with no equipment out and no equipment back after the day breakdown are hidden.
G
The table columns are Date, Customer, Delivery address, Equipment out, Equipment back, and Pickup / dropoff instructions.
G
Customer shows the customer name and the document number underneath.
G
Delivery address uses Site address first. If Site address is blank, it uses Dropoff address. If both are blank, it shows
`--`.
G
Equipment out and Equipment back group equipment by type. Assigned units show serial number or asset id, model name, and
asset notes when available. If no unit is assigned, the line shows TBD.
G
Pickup / dropoff instructions combine Site access information, Logistics instructions, and Special instructions.
G
Clicking a row opens the rental order.
G
Search in Pick/Return checks document number, status, customer, customer PO/external contract number, pickup location,
dates, delivery address, site name, site access, logistics, special instructions, equipment type, serial number, model,
and asset notes.
G
Pick/Return rows are sorted by day first and then by document number.
How to use Pick/Return operationally
G
Use Equipment out to prepare pickups/deliveries that should leave the yard or enter service.
G
Use Equipment back to prepare returns that should come back from the customer or jobsite.
G
If a line shows TBD, the order has a type/date demand line but no assigned unit. Assign a unit on the rental order before
dispatching the work.
G
If the delivery address or instructions show `--`, complete the logistics fields on the rental order before dispatch.
G
Actual pickup and actual return are recorded on the rental order line item, not directly in the Pick/Return table.
Mandatory information / rules
G
An existing rental order with line items is required before it can appear as meaningful pick/return work.
Optional but useful information
G
Use date filters to focus staff only on today's work or a short upcoming window.
Important notes
G
Booked dates show what is planned. Actual dates document what happened. This distinction matters for billing, availability,
and operational history.
G
Pick/Return is a movement checklist, not a billing page. It uses dates and equipment details to help staff decide what
needs to move.
G
An order can appear in Pick/Return even if units are not assigned yet; those lines display as TBD.
G
If an expected pickup or return is missing, check the selected date window, status filters, line start/end dates, actual
pickup/return dates, and whether the order's line items overlap the selected range.
Screenshot: Work Bench - Pick/Return View

Image file: `screenshots/p08_01_work_bench_pick_return_view.png`



---

## Page 9

Aiven Rental App User Manual
Page 9
4. Dashboard
The Dashboard is for higher-level visibility into company context, availability, projected demand, asset/location mapping,
and manually tracked operational incident metrics. In the current Dashboard page, the main visible working area is the
Availability & Utilization card. The card is named broadly, but the rendered page is primarily an availability,
shortfall, map, and upcoming-demand view.
Dashboard - Map View
Purpose: Use the map inside the Availability & Utilization dashboard to understand where units or locations are plotted.
The map appears in the trend area when no equipment type is selected, when the chart cannot be rendered, or when the app
falls back from the line chart to the map panel.
How to use it
1
Open Dashboard from the side navigation.
2
Use the Availability & Utilization controls to choose the horizon, location, category, equipment type, and whether to split
results by location.
3
Select an equipment type or detail view when the dashboard asks for a more specific selection.
4
Use Map view to switch between Street and Satellite.
5
Use Show to switch the map between Units and Locations.
6
Use the map together with the trend chart and upcoming-demand table to identify where equipment is located, where demand
is coming from, and whether availability looks tight.
What the map is showing
G
Show = Units plots equipment/assets. For each unit, the map uses Current location coordinates first. If Current location is
blank or has no coordinates, the map falls back to the Base location coordinates. If neither location has coordinates, the
unit is counted as missing coordinates and no marker is drawn for it.
G
Show = Locations plots saved base locations/locations returned by the location list. It does not automatically show every
temporary/non-base current-location pin created for jobsites or customer links.
G
Unit markers are slightly offset when multiple units share the same coordinates so overlapping units can still be clicked.
Marker color reflects the unit's current rental availability status.
G
Map marker colors are different from the donut colors. On the map, gray means not rented/not out, green means rented or
out, and red means overdue. The legend beside the map uses these same colors.
G
Clicking a unit marker opens a popup with equipment type/model, serial number, current or base location, status, and a
link to open the asset in Stock/Assets. If the marker is using current-location coordinates, the popup also shows the base
location; if it is using base-location coordinates, it also shows the current-location text when available.
G
Show = Locations uses standard location markers instead of colored unit-status markers. Clicking a location marker shows
the location name, address, and Open link.
G
Map view = Street uses road/street tiles. Map view = Satellite uses satellite/imagery tiles.
G
The map can run through Google Maps when a Google Maps API key is configured, or Leaflet/OpenStreetMap when the user
switches the map provider in settings. Google address search depends on Google Places; Leaflet search uses the app's
OpenStreetMap/Nominatim search endpoint.
Mandatory information / rules
G
No entry fields are mandatory for map viewing.
Optional but useful information
G
Filters are optional but recommended when the company has many assets, locations, or active orders.
Important notes
G
Map accuracy depends on clean equipment current locations, saved location addresses, site addresses, and geocoding. If
data is missing or incomplete, the map may show fewer markers or less precise positions.
G
Changing a rental order or asset does not guarantee an immediate visible map marker unless the resulting location has
coordinates. A named location without coordinates is valid operational data, but it is not enough to plot a point.
G
The map is not the same as availability math. A unit can be counted in availability even when it has no coordinates and
therefore cannot be plotted.
Screenshot: Dashboard - Map View

Image file: `screenshots/p09_01_dashboard_map_view.png`


Dashboard - Availability and Utilization View
Purpose: Review equipment availability, projected demand, open shortages, current equipment status, and upcoming demand
over a selected period.

---

## Page 10

Aiven Rental App User Manual
Page 10
How to use it
1
Open Dashboard.
2
Review the Availability & Utilization dashboard.
3
Choose the horizon: 14, 30, 60, 90, 180, or 360 days.
4
Filter by location, equipment category, equipment type, and Split by location when needed.
5
Review the incident strip, equipment type donuts, selected-type trend chart or map, and upcoming-demand table.
6
Use the results before promising equipment on a quote or rental order.
Dashboard sections
G
Company shows which company context the Dashboard is using. If no company is active, the page asks the user to log in.
G
Alerts / Incidents / Breaches shows manually tracked operational counts for This month and Year to date. These numbers
are loaded from company settings when available and cached locally in the browser.
G
Update opens a modal where the user chooses a month and enters non-negative whole-number counts for Alerts, Incidents,
and Breaches. Saving writes the metrics back to company settings. The legacy `dashboardIncidentsCount` field is still
used as a fallback for the current month's incident count when detailed monthly metrics are missing.
G
The equipment type donut grid shows one donut per included equipment type. The rows are sorted by the tightest committed
availability first, so types with the lowest committed availability appear earlier.
G
The trend/map panel changes based on selection. If no type is selected, the panel shows the map. Selecting a type opens
the Availability or Demand line chart for that type.
G
Upcoming demand by customer groups future customer demand by customer and equipment type. Hide table collapses this table
without changing the availability calculations.
Filters and views
G
Horizon controls the forward-looking range starting today. The UI offers 14, 30, 60, 90, 180, and 360 days. In the current
backend implementation, the availability summary and selected-type trend calculations are capped at 180 days even though
the UI offers 360 days. The upcoming-demand table still requests the selected date range.
G
Location filters the availability and demand data to one pickup/base/current location context depending on the query being
used. When a location is selected, Split by location is disabled because the chart is already focused on one location.
G
Category filters equipment types by equipment category.
G
Type filters the whole card to one equipment type and automatically selects that type for the chart.
G
Split by location is available only when Location is All. It creates one line set per location for the selected equipment
type. Without the split, the chart combines all locations into one line set.
G
Trend = Availability shows units remaining available over time. Trend = Demand shows units demanded/out over time.
G
Map view switches between Street and Satellite map tiles.
G
Show = Units displays unit markers. Show = Locations displays location markers.
Equipment type donut colors and counts
G
The donut is a current-state snapshot by equipment type, not a day-by-day forecast. It uses the current equipment list,
asset availability status, out-of-service work orders, asset condition, and unassigned reservation/request demand.
G
Green on the donut means Currently out. A unit is counted as out when its availability status text includes out, overdue,
or rent.
G
Yellow on the donut means Reserved. A unit is counted as reserved when its availability status includes reserve.
Unassigned requested/reservation lines with no selected inventory can also move available quantity into the reserved
count, up to the number of available units.
G
Red on the donut means Available in the current theme. This is counterintuitive but matches the implemented CSS. Red on
the donut is not the same thing as a red shortage line on the trend chart.
G
Blue on the donut means Needs repair / out of service. A unit is counted here when it is tied to a non-closed
out-of-service work order or when the asset condition text includes repair.
G
Light gray means the donut has no countable units for that type.
G
The numbers drawn around the donut are the counts for each non-zero segment. Hovering a segment label shows the segment
name and count.
G
The image in the center comes from the equipment type image when available, or from the equipment image fallback gathered
from assets of that type. If no image is available, the center stays plain.
G
Equipment types named rerent, re-rent, or re rent are excluded from this dashboard's shortfall type list.
Availability and demand math
G
Availability is capacity left. For the selected type and day, committed availability is total units minus committed
demand. Committed demand means statuses `reservation` and `ordered`.
G
Potential availability is total units minus committed demand minus projected demand. Projected demand means statuses
`quote` and `requested`.
G
Available w/ PO includes incoming purchase orders. It adds open purchase orders for the type when the purchase order has
no assigned equipment, is not closed, and has an expected possession date within the chart horizon. Once the expected
possession date is reached, the incoming quantity is treated as available for the rest of the displayed range.
G
Demand is usage or requested quantity. In Demand view, the committed demand line is the number of units out or reserved
from `reservation` and `ordered` records. The quotes + requests line adds `quote` and `requested` demand on top.
G
Availability and demand are two sides of the same data. Availability answers "how many units are left?" Demand answers
"how many units are being asked for?" A low or negative availability value means demand has consumed or exceeded counted
capacity.
G
For date overlap, the dashboard uses actual fulfilled/pickup dates when present and scheduled start dates otherwise. It
uses actual returned dates when present. If an ordered line has no return and its scheduled end is in the past, it is
treated as still active through now so overdue/open work continues to consume availability.
G
Line quantity is the number of assigned units when inventory is assigned. If no unit is assigned to a line, the dashboard
treats the line as quantity 1 for availability/demand calculations.
G
Assigned demand is located by the assigned equipment's current/base location when available. Unassigned demand is located
by the rental order pickup location.
Availability trend line types and colors
G
Solid line = Committed availability. It subtracts `reservation` and `ordered` quantities from total units. When Split by
location is off, the label is Committed. When Split by location is on, each location gets its own "(committed)" line.
G
A committed line segment turns red when either end of that segment is below zero. That red segment means committed demand
exceeds available counted capacity for that day range.
G
Short green dashed line = Available w/ PO. This line appears only in Availability view. It shows committed availability
after adding expected incoming purchase-order units.
G
Long dashed faded line = Potential (quotes + requests). It subtracts committed demand plus quote/request demand. It is
faded because quotes and requests are less firm than reservations and ordered rentals.
G
The horizontal zero grid line is drawn darker than the other grid lines. Values below zero are shortfalls.
G
When Split by location is enabled, the chart uses a rotating location color palette: blue, green, amber, red, purple,
sky blue, pink, bright green, indigo, and orange. Each location's committed/potential lines share that location color,
with potential drawn faded. The Available w/ PO line is green.
Demand trend line types
G
In Demand view, the solid line is Out or the location-specific "(out)" line. It represents committed demand from
`reservation` and `ordered`.
G
In Demand view, the dashed faded line is Out (quotes + requests) or the location-specific "(quotes + requests)" line. It
represents committed demand plus `quote` and `requested` demand.
G
Demand view does not show the Available w/ PO line because it is showing requested/out quantity, not remaining capacity.
G
The chart code can request contributing order details on hover. In Availability view, that detail request is limited to
shortage/negative points. In the current rendered Dashboard page, users should rely on the chart tooltip and the upcoming
demand table unless a visible detail panel is present.
Upcoming demand by customer
G
The upcoming-demand table includes statuses `quote`, `requested`, and `reservation`. It does not include `ordered`
because ordered work is already active/committed rather than upcoming demand.
G
Rows are grouped by customer. Columns are equipment types. Each cell shows quantity and start date entries for that
customer/type combination.
G
The table is sorted by the customer's earliest upcoming start date, then by customer name when dates are tied or missing.
G
The Total going out row sums the demand quantity by type across all listed customers.
G
The table respects the same horizon, location, category, and type filters as the dashboard controls.
Mandatory information / rules
G
No fields are required to view availability.
Optional but useful information
G
Use Trend to switch between Availability and Demand. Use the incident/alert area to review shortages, breaches, or other
availability signals, then use Update when an incident needs attention.
Important notes
G
Availability is most useful when rental orders have accurate booked dates, actual dates, and unit assignments.
G
Quotes and requested orders can reduce potential availability and increase demand even though they are not active rental
orders. This is intentional: they represent pipeline demand.
G
Reservations and ordered rentals reduce committed availability. Ordered rentals with missing actual returns can continue
to consume availability through the current time.
G
Out-of-service work orders and repair conditions affect the donut status snapshot, but the forward availability lines are
driven by equipment counts, rental demand, and incoming purchase orders.
G
The dashboard relies on clean equipment type, location, order date, and status data. Missing type, missing dates, missing
location coordinates, or incorrect statuses can make a type disappear, move demand to the wrong place, or make the map
look incomplete.
Screenshot: Dashboard - Availability and Utilization View

Image file: `screenshots/p10_01_dashboard_availability_and_utilization_view.png`



---

## Page 11

Aiven Rental App User Manual
Page 11
5. Quotes and Rental Orders
Quotes and rental orders use the same rental order form and the same saved record structure. The difference is the
status and document numbering. A quote is a planning/proposal record with status `quote` or `quote_rejected`; it uses a
QO number and does not reserve a specific internal unit. A rental order is an operational record with a non-quote status
such as `requested`, `reservation`, `ordered`, `received`, or `closed`; it can receive an RO number and can move into
unit assignment, pickup, return, billing review, and operational reporting.
Core difference between quote and rental order
G
Quote: used to price and propose work. Unit selection is locked in `quote` and `quote_rejected`, and any unit ids are
removed before save. The quote still contributes to demand/capacity views because its type, dates, and rates are saved,
but it does not claim a specific asset.
G
Rental order: used to operate the job. `reservation` can hold planned demand and optionally assign a unit. `ordered`
means work has started or is ready to start; it can save a TBD unit, but actual pickup/delivery cannot be recorded until
a unit or valid bundle is selected. `received` and `closed` require concrete units or valid bundles for normal internal
equipment lines.
G
Converted quote: when a quote is moved to an operational status, the app keeps the quote context and creates/uses an
RO number for operations. In the Quotes table, converted means the record is no longer in `quote` or `quote_rejected`.
G
Rejected quote/request: `quote_rejected` and `request_rejected` are not active operating states. They are kept for
history and follow-up.
Status reference
G
`quote`: active proposal. Customer is optional. Units are locked. Actual pickup/return is not the normal workflow.
G
`quote_rejected`: rejected proposal. Customer is optional. Units are locked. The record remains available for history and
can be moved back to `quote` from the quote workflow.
G
`requested`: request/demand state, commonly used for customer-submitted booking demand. Customer is optional in the
save rules. Units are locked in the form and stripped before save.
G
`request_rejected`: rejected customer/request state. It is kept for review/history and is not an active operating state.
G
`reservation`: operational planning state. Customer is still optional in the save rules. Units can be assigned, but are not
required. This is the first status where saved unit assignments are allowed.
G
`ordered`: active outgoing/in-field state. A normal equipment line can be saved as TBD with no unit, but pickup/delivery
actions require a selected unit or available bundle. If any line item has an actual pickup/delivery date, the app may keep
or move the order in this operational state.
G
`received`: returned/received state. Normal internal equipment lines require unit or bundle assignments. If a `received`
order still has unreturned actual line items, the server can move it back to `ordered` so the status matches the line
items.
G
`closed`: final operational state. Closed orders cannot be deleted. When an order is closed through the status workflow,
future line-item end dates that have already started are clamped to the close time so availability does not stay blocked
into the future.
Automatic status behavior
G
The server normalizes older or alternate status names. For example, `draft` becomes `quote`, `rejected` becomes
`quote_rejected`, and the misspelled `recieved` becomes `received`.
G
For `requested`, `reservation`, `ordered`, and `received`, the server reviews the line items during save. If all valid line
items are returned, the status becomes `received`. If a requested or reserved order has at least one picked-up line, the
status becomes `ordered`. If a received order still has an unreturned picked-up line, the status becomes `ordered`.
Quotes Table
Purpose: Manage proposed rentals before they become active rental orders.
How to use it
1
Click Quotes in the side navigation.
2
Use the table to review Quote #, Status, Customer, Sales, Start, End, Monthly recurring, RO #, Actions, Updates, and
History.
3
Use search or filters to find a specific quote.
4
Click a quote row to open the quote detail page.
5
Click New Quote if you need to create a new quote.
6
Use Reserve to move an active quote to `reservation`, Reject to move it to `quote_rejected`, or Undo to move a rejected
or reserved quote back to `quote`.
Mandatory information / rules
G
At the table level, no fields are mandatory. Saving a quote requires at least one line item with equipment type and booked
start/end dates. A customer is not required while the record is in the demand-only statuses `quote`, `quote_rejected`,
`reservation`, or `requested`.
Optional but useful information
G
Use the Active, Rejected, and Converted filters. Active means `quote`; Rejected means `quote_rejected`; Converted means
any non-quote operational status such as `reservation`, `ordered`, `received`, or `closed`.
Important notes
G
Quotes are planning/proposal records. Actual pickup/return dates are used on operational rental orders after units are
selected and field events happen. There is no `sent` quote status in the app.
G
The Quotes table can show converted quote records. Those records are no longer editable as simple proposals if their
status is operational; use the rental order workflow and operational status rules.
Screenshot: Quotes Table

Image file: `screenshots/p11_01_quotes_table.png`



---

## Page 12

Aiven Rental App User Manual
Page 12
Rental Order Table
Purpose: Find, open, and create rental orders.
How to use it
1
Click Rental Orders in the side navigation.
2
Review the table columns: Doc #, Status, Customer, Model names, Sales, Start, End, Monthly / Total, and Updates.
3
Use search to find a document number, status, customer, customer PO, external contract number, model name, salesperson,
start date, or end date.
4
Use the status filters Requested, Reservation, Ordered, Received, and Closed to narrow the list. Closed is unchecked by
default.
5
Click an existing row to open the rental order detail page.
6
Click New RO to create a rental order.
Mandatory information / rules
G
No fields are mandatory to view the table.
Optional but useful information
G
Use table columns and filters to build an operations, accounting, or sales-focused view.
Important notes
G
The rental order table is the safest starting point when a customer calls about an active rental.
Screenshot: Rental Order Table

Image file: `screenshots/p12_01_rental_order_table.png`


Rental Order / Quote Detail Page
Purpose: Create or edit the full operational record for a quote or rental order: customer, dates, site, contacts, line items,
charges, documents, and status.
How to use it
1
Open Quotes or Rental Orders from the side navigation.
2
Click New Quote or New RO, or open an existing record from the table.
3
Select the customer when the order will move past demand-only planning. Customer is required for statuses outside
`quote`, `quote_rejected`, `reservation`, and `requested`.

---

## Page 13

Aiven Rental App User Manual
Page 13
4
Fill in customer PO, salesperson, fulfillment method, status, terms, special instructions, notes, and order contacts. Quote
and RO numbers are generated by the app and shown after save.
5
Fill in pickup location, pickup/drop-off address, pickup/drop-off instructions, site name, site address, site access
information / pin, critical assets and locations on site, monitoring personnel, general notes, emergency contacts,
emergency contact instructions, site contacts, notification circumstances, coverage hours, coverage time zone, and stat
holiday coverage flag.
6
Add line items for each rented equipment type, bundle, or re-rent item. Add order-level charges through Additional fees.
7
Add booked dates to show the planned pickup/start/return/end timing.
8
For rental orders, add actual dates when the field work actually happens.
9
Review totals, monthly recurring charges, documents, attachments, and history.
10
Save the record.
Mandatory information / rules
G
Customer is required for statuses outside `quote`, `quote_rejected`, `reservation`, and `requested`.
G
Saving requires at least one line item with equipment type, booked start date/time, and booked end date/time.
G
Line item end time must be after line item start time.
G
Re-rent lines require an outside description.
G
When an order reaches `ordered`, `received`, or `closed`, non-rerent and non-bundle lines require exactly one unit unless
the status is `ordered` and the line is intentionally saved as TBD with no unit. Bundle lines require an available bundle
with at least one asset.
G
Only complete line items are sent to the server. A line item that is missing equipment type, booked start, or booked end is
treated as incomplete and can disappear after save because it is not part of the saved payload.
G
Additional fees save only when the fee name is filled in. A blank fee name is ignored; a blank or invalid fee amount is saved
as zero only when the fee row has a name.
Optional but useful information
G
Customer PO, salesperson, pickup/drop-off instructions, terms, special instructions, notes, order contacts, site details,
emergency contacts, coverage hours, attachments, and QuickBooks document data are optional at save time in the app.
G
The QuickBooks documents section is part of the rental order form and includes a Sync QBO action. It shows linked
QuickBooks documents when the company has QuickBooks data connected.
Important notes
G
Treat the detail page as the source of truth for the order. If a line item, date, address, or contact is missing here, downstream
boards and billing views may be incomplete.
G
Use booked dates for planning and availability. Use actual dates for completed field events and order execution.
G
If the Save action appears to do something unexpected, check status first. Status controls decide whether customer is
required, whether units are locked, whether unit assignments are required, and whether actual pickup/return actions are
allowed.
Screenshot: Rental Order / Quote Detail Page (1)

Image file: `screenshots/p13_01_rental_order_quote_detail_page_1.png`



---

## Page 14

Aiven Rental App User Manual
Page 14
Screenshot: Rental Order / Quote Detail Page (2)

Image file: `screenshots/p14_01_rental_order_quote_detail_page_2.png`


Screenshot: Rental Order / Quote Detail Page (3)

Image file: `screenshots/p14_02_rental_order_quote_detail_page_3.png`


Detailed Workflow: Create a New Rental Order
1
Open the side navigation and click Rental Orders.
2
Click New RO.
3
Select the customer. For a new customer, use the Customer field's + Add new customer option or create the customer from
Customers, then return to the rental order.
4
Fill in customer PO, salesperson, fulfillment method, status, terms, special instructions, notes, and order contacts. The app
generates the RO/quote number when the record is saved.
5
Fill in the site/logistics section: pickup location or yard, site/dropoff address, site name, site contacts, emergency contacts,
logistics instructions, critical areas, coverage hours, and special instructions.
6
Add line items. For each line, choose Equipment type.
7
Open Booked Dates, enter Start and End, choose Period (`daily`, `weekly`, or `monthly`), enter Rate, and select a Unit
when the status requires one.
8
Save the rental order. New RO starts from status `reservation`; the status selector supports Requested, Reservation,
Ordered, and Received, with Close/Open controls available for saved records.
9
When equipment is actually picked, delivered, paused, or returned, open Actual Dates and record the real dates.

---

## Page 15

Aiven Rental App User Manual
Page 15
10
Use attachments, before/after documents, monthly charges, and history as needed after the order is created.
Mandatory: customer for statuses outside `quote`, `quote_rejected`, `reservation`, and `requested`; at least one line
item with equipment type and booked start/end dates; end time after start time; status-driven unit assignments when the
order moves into `ordered`, `received`, or `closed`. Re-rent lines need a product description.
Detailed Workflow: Add Line Items to a Quote or Rental Order
1
Open the quote or rental order detail page.
2
Go to the line items section.
3
Click Add line item.
4
Choose the equipment type. To add a re-rent, choose the Rerent option and enter the product description in the Unit
field. Bundles are selected through available bundle/unit options for the chosen type.
5
Open Booked Dates and enter Start and End. The app defaults the End to 24 hours after Start when Start is entered and
End is blank.
6
Choose Period (`daily`, `weekly`, or `monthly`) and enter Rate. Quantity is not part of the normal line-item workflow; each
line represents one unit, one bundle, or one re-rent item.
7
Select a Unit when the order status requires it. In `quote`, `quote_rejected`, and `requested`, unit selection is locked and
the line shows "No unit assigned until ordered." In `reservation`, a unit can be assigned but is not required. In `ordered`,
a non-rerent line can be saved as TBD with no unit, but actual pickup cannot be recorded until a unit or valid bundle is
selected. In `received` and `closed`, non-rerent lines require a unit or valid bundle.
8
Save the order and confirm that the line amount, recurring monthly amount, and contract total update.
Repeat for each unit, bundle, or re-rent item. Use Additional fees for order-level charges.
Line item logic and expected behavior
G
One line item represents one internal unit, one bundle, or one outside re-rent item. There is no normal quantity box on
the rental order line-item form. If the customer needs three of the same type, add three lines.
G
The app treats equipment type and booked dates as the minimum definition of a rental line. Pricing, availability,
monthly recurring amounts, customer-facing updates, and operations all depend on those fields.
G
Changing the equipment type or booked dates refreshes availability. If only one unit is available for the selected type and
dates, the form can auto-select that unit. If multiple units are available, the user chooses from the Unit search field.
G
Rates come from the selected period and rate on the line. Customer-specific pricing, equipment type defaults, and bundle
rates can be used to suggest a rate, but the line stores the selected period (`daily`, `weekly`, or `monthly`) and rate
amount.
G
Re-rent lines do not use internal inventory. The Unit field becomes a product description field, and that description is
mandatory because there is no internal asset record to label the rented product.
G
Bundle lines represent a configured bundle. The app shows bundle items and checks whether all bundle assets are free for
the selected dates. A bundle line cannot be saved in a unit-required status when the bundle has no assets or is unavailable.
G
Before/after notes, before/after images, AI damage reports, and pause periods belong to the line item, not only to the
overall order. This is why each line has its own before/after documents and actual-date controls.
Unit selection logic
G
Unit selection is locked in `quote`, `quote_rejected`, and `requested`. The UI displays "No unit assigned until ordered,"
and the save payload removes inventory ids even if a previous draft or browser state had them.
G
Unit selection is optional in `reservation`. This lets staff reserve demand by type and dates without committing to a
specific serial number.
G
Unit selection is required in `received` and `closed` for normal internal equipment lines. In `ordered`, the app allows a
TBD line with no unit so the order can be created before dispatch assigns a specific unit. However, actual pickup/delivery
cannot be recorded until the line has a unit or valid bundle.
G
The Unit search only searches units that are available for the selected type and booked date range. A selected unit that
becomes unavailable can appear as "Unavailable." A unit already selected on another line in the same order can appear as
"Already selected on another line item."
G
The app excludes the current order when refreshing availability for an existing saved order. This lets an already assigned
unit remain available to its own line while still blocking it from other overlapping orders.
Why a unit or bundle may not be available
G
The line has no equipment type, start, or end date yet, so the app cannot ask for availability.
G
The order status locks unit selection (`quote`, `quote_rejected`, or `requested`).
G
No asset of that equipment type exists for the company, or the matching asset is a placeholder serial number such as
`UNALLOCATED-...`. Capacity summaries also exclude assets marked `Lost` or `Unusable`.
G
The asset or any asset in the selected bundle has an overlapping assignment on a `requested`, `reservation`, or `ordered`
record.
G
The asset or any asset in the selected bundle has an overlapping out-of-service period.
G
The selected unit is already used on another line item in the same order.
G
The selected bundle has no assets configured, does not include a primary/eligible asset for the chosen type, or one of its
assets is blocked by another order or service window.
Why a rental order may not save or may not save as expected
G
No active company is selected. The form requires a company context before saving.
G
The status requires a customer and no customer is selected. Customer is required outside `quote`, `quote_rejected`,
`reservation`, and `requested`.
G
There are no complete line items. At least one line must have equipment type, booked start, and booked end.
G
A booked end date is not after the booked start date.
G
A re-rent line is missing its product description.
G
The status requires units and a normal equipment line has zero available units for its dates.
G
The status requires units and the line has more than one selected unit or no selected unit. The only exception is `ordered`,
where zero selected units is allowed as TBD for normal equipment lines.
G
A bundle line is unavailable for the dates or the bundle has no assets.
G
An actual pickup date is in the future, an actual return date is before pickup, or the line has no unit/bundle to pick up.
G
During actual pickup, the server can reject the action if the selected unit has a conflicting actual rental interval or no
assigned inventory remains on the line.
G
Incomplete line rows are not saved. If a user adds a line but leaves type or booked dates blank, that line is treated as a
draft-only row and can be missing after reload.
Operational pickup, return, and line status behavior
G
Booked dates are the planned rental window. They drive availability checks, demand, and planned totals.
G
Actual pickup/delivery (`fulfilledAt`) and actual return (`returnedAt`) are the field event dates. Once actual dates exist,
the server uses actual pickup as the effective start and actual return as the effective end for recurring calculations and
availability where applicable.
G
Line badges show the operational state: awaiting pickup/delivery, return pending, returned, or paused.
G
A line can be paused with pause start/end values. Only one open pause can exist at a time. The pause UI stores dates, not
a separate pause reason.
G
Actual return can prompt the user to set the assigned unit's current location back to base or do nothing. Choose the base
option only when the unit really returned to its base location.
Pricing, totals, and monthly charges from line items
G
The form calculates the visible line amount from booked or actual dates, selected period, selected rate, company billing
rounding, and monthly proration settings.
G
Order-level Additional fees are separate from rental line items. Use fees for delivery, fuel, damage, administrative,
service, or one-time charges that should not reserve equipment.
G
Monthly recurring values are recomputed after saves and status changes. They are a billing review aid, not a separate
manual price list.
Rental Order / Quote - Pick Site Address Popup
Purpose: Choose or confirm the site address used for the quote or rental order.
How to use it
1
Open the rental order or quote detail page.
2
Go to the site address or location section.
3
Click Pick site address on map.
4
Search for an address or click the map to drop a pin.
5
Use the Unit pin selector when you need to set an assigned unit's current-location pin.
6
Click Use this address.
Implemented behavior
G
The site address field and site-address map pin belong to the rental order. They are used for logistics, customer-facing
order information, dispatch planning, and later asset-location updates.
G
When a unit is selected in the Unit pin selector, clicking the map sets a pin for that unit rather than only setting the order
site address. Saving the unit pin creates a non-base location record, assigns that location as the selected asset's Current
location, and records a current-location history entry.
G
Unit pins are available only for assigned units. If the order line has no selected unit yet, there is no asset id for the app to
move.
G
If asset directions are enabled in company settings, saving a unit pin can prompt for directions. Those directions are saved
on the asset, not on the location record itself.
Mandatory information / rules
G
Site address is optional at save time. It should be completed before dispatch, delivery, pickup, or return work.
Optional but useful information
G
Use Site name, Site access information / pin, Pickup / Drop-off instructions, Emergency contacts, Site contacts, and Hours
of coverage required for field instructions.
Important notes
G
Accurate site addresses improve map views, dispatch planning, customer communication, and asset current-location
tracking.
G
Picking a site address for the order is not the same as assigning every unit's current location. The backend updates picked
up units to the order site when actual pickup/delivery is recorded, and the unit-pin tool can also update one specific unit
directly.

---

## Page 16

Aiven Rental App User Manual
Page 16
Screenshot: Rental Order / Quote - Pick Site Address Popup

Image file: `screenshots/p16_01_rental_order_quote_pick_site_address_popup.png`


Rental Order / Quote - Additional Fee Popup
Purpose: Add one-time charges that are not standard equipment rental line items.
How to use it
1
Open the rental order or quote detail page.
2
Find the fees, charges, or line-item area.
3
Click Additional fees.
4
Enter the fee name/description.
5
Enter the fee amount or rate.
6
Enter the fee date when the date matters for billing review.
7
Click Save fees.
8
Review the order total to confirm the charge appears correctly.
Mandatory information / rules
G
The app saves fee rows that have a fee name. Amount is saved as a number and defaults to 0 when left blank.
Optional but useful information
G
Additional fees are order-level charges. The implemented fee fields are name, amount, and fee date.
Important notes

---

## Page 17

Aiven Rental App User Manual
Page 17
G
Use fees for delivery, pickup, cleaning, damage, fuel, setup, teardown, disposal, or administrative charges.
Screenshot: Rental Order / Quote - Additional Fee Popup

Image file: `screenshots/p17_01_rental_order_quote_additional_fee_popup.png`


Rental Order / Quote - Before/After Documents Popup
Purpose: Store condition documentation before and after the rental period.
How to use it
1
Open the order or quote.
2
Open the Before/After documents popup.
3
Choose whether you are adding before-rental or after-rental documentation.
4
Upload before-rental or after-rental images.
5
Add notes that describe condition, damage, missing items, or customer sign-off.
6
Save the documents.
7
Return to the detail page and confirm the document appears in the relevant document area.
Mandatory information / rules
G
Before/after images and notes are optional in the app.
Optional but useful information
G
Use notes to explain why a document matters, especially for damage or customer disputes.
Important notes
G
Before/after documentation is especially helpful for high-value assets, damage claims, and proof-of-condition records.

---

## Page 18

Aiven Rental App User Manual
Page 18
Screenshot: Rental Order / Quote - Before/After Documents Popup

Image file: `screenshots/p18_01_rental_order_quote_before_after_documents_popup.png`


Rental Order / Quote - Booked Dates Popup
Purpose: Record the planned dates for a rental. Booked dates are scheduling dates, not proof that work happened.
How to use it
1
Open the order or quote detail page.
2
Click the booked dates field or booked dates button.
3
Enter the planned pickup/start date.
4
Enter the planned return/end date.
5
Use Save to update only this line item, or Save & apply to all to copy the booked dates to every line item.
6
Save the booked dates.
7
Check the timeline, availability view, or order header to confirm the schedule updated.
Mandatory information / rules
G
Booked start and booked end are required for a line item to be valid for save. The app rejects a line item when end time is
not after start time.
Optional but useful information
G
The booked dates popup contains Start and End. If End is blank when Start is entered, the app uses a 24-hour default end
for the line item.
Important notes
G
Booked dates help reserve equipment and show expected rental duration. They should be updated when the customer
changes the planned schedule.

---

## Page 19

Aiven Rental App User Manual
Page 19
Screenshot: Rental Order / Quote - Booked Dates Popup

Image file: `screenshots/p19_01_rental_order_quote_booked_dates_popup.png`


Rental Order - Actual Dates Popup
Purpose: Record what actually happened in the field, such as actual pickup/delivery, return, and pause periods.
How to use it
1
Open the rental order detail page.
2
Open the actual dates popup.
3
Enter Pick up / delivery when equipment has actually left the yard or entered service. The pickup field is disabled until
the line has a unit or bundle selected.
4
Enter Returned when equipment is actually returned or removed from service.
5
Use Save for the current line item or Save & apply to all for all line items with selected units.
6
When a return date is added, choose whether to Set current location to base location or Do nothing.
Implemented behavior
G
Actual pickup/delivery is the event that moves assigned units out operationally. When pickup/delivery is saved on an
existing order, the backend attempts to set the assigned equipment's Current location to the order's site-address location.
If the order has a saved site address or map pin, the app creates/uses a non-base "Order ... - Site" location and writes a
location-history entry for each moved unit.
G
If the site address has no usable address or coordinates, the actual pickup date can still save, but the automatic
current-location move may have no location to apply.
G
When Returned is added, the app asks whether to Set current location to base location or Do nothing. Choosing base calls
the current-location-to-base endpoint for the affected assigned units. Choosing Do nothing preserves the unit's existing
Current location even though the line is marked returned.
G
Save & apply to all only applies actual dates to line items that have selected units. It cannot move or return unassigned
TBD lines.
Mandatory information / rules
G
Actual pickup/return dates cannot be in the future. A return cannot be recorded before pickup; the popup tells the user
that pick up/delivery time is required before recording a return.
Optional but useful information
G
Returned can remain blank while the rental is active. The line header shows Awaiting pickup/delivery, Return pending,
Returned, or Paused.
Important notes
G
Do not use actual dates as estimates. If the event has not happened yet, use booked dates instead.
G
If the current location looks wrong after pickup or return, check the order's site address/pin, the asset's base location, and
whether the return prompt was set to move the unit back to base.

---

## Page 20

Aiven Rental App User Manual
Page 20
Screenshot: Rental Order - Actual Dates Popup (1)

Image file: `screenshots/p20_01_rental_order_actual_dates_popup_1.png`


Screenshot: Rental Order - Actual Dates Popup (2)

Image file: `screenshots/p20_02_rental_order_actual_dates_popup_2.png`



---

## Page 21

Aiven Rental App User Manual
Page 21
Rental Order - Add Pause Period
Purpose: Record a period where billing or rental activity should be paused.
How to use it
1
Open the rental order actual dates popup.
2
Choose the option to add a pause period.
3
Enter the pause start date.
4
Enter the pause end date to close the pause, or leave it blank to keep the pause ongoing.
5
Click Add pause.
6
Save the actual dates popup.
7
Review monthly charges or order totals to confirm the pause is reflected as intended.
Mandatory information / rules
G
A pause can be added with start and end together, with start only for an ongoing pause, or with end only to close the
current open pause. The pause end must be after the pause start, and only one open pause can exist at a time.
Optional but useful information
G
The pause UI stores pause start and pause end. It does not include a separate pause reason field.
Important notes
G
Use pause periods carefully because they can affect billing, customer balance, and revenue reporting.
Screenshot: Rental Order - Add Pause Period

Image file: `screenshots/p21_01_rental_order_add_pause_period.png`



---

## Page 22

Aiven Rental App User Manual
Page 22
Rental Order / Quote - Attachments Drawer
Purpose: Attach supporting files to the order or quote.
How to use it
1
Open the order or quote detail page.
2
Open the attachments drawer.
3
Upload the relevant file.
4
Click Upload.
5
Wait for upload completion.
6
Verify the file appears in the attachment list.
Mandatory information / rules
G
Attachments are optional in the app.
Optional but useful information
G
Attach signed agreements, permits, site photos, customer POs, delivery documents, or inspection files.
Important notes
G
Use the attachment drawer for general files. Use before/after document popups for condition-specific records.
Screenshot: Rental Order / Quote - Attachments Drawer

Image file: `screenshots/p22_01_rental_order_quote_attachments_drawer.png`


Rental Order / Quote - History Page
Purpose: Review past changes and events on a quote or rental order.
How to use it
1
Open the quote or rental order.

---

## Page 23

Aiven Rental App User Manual
Page 23
2
Open the History page or history tab.
3
Review the chronological list of updates.
4
Use the history to confirm who changed dates, status, line items, documents, or other important information.
5
Return to the detail page when finished.
Mandatory information / rules
G
No fields are required; this is a review page.
Optional but useful information
G
Use history during billing questions, customer disputes, or internal audits.
Important notes
G
History is a diagnostic tool. It helps explain what changed, but edits should be made on the detail page.
Screenshot: Rental Order / Quote - History Page

Image file: `screenshots/p23_01_rental_order_quote_history_page.png`


Rental Order / Quote - Monthly Charges
Purpose: Review monthly recurring charges connected to a specific order or quote.
How to use it
1
Open the order or quote detail page.
2
Open the Monthly Charges section.
3
Review the line items and monthly totals.
4
Confirm which items are recurring and which are one-time fees.
5
If a recurring amount is wrong, return to the line item or pricing section and update the source information.
6
Save the record and re-check the monthly charges.
Mandatory information / rules
G
At least one recurring line item is needed for meaningful monthly charges.
Optional but useful information
G
Monthly charges are available from the rental order form's Monthly charges button on saved records.
G
The button is available only after the quote/order has been saved because the monthly charges page needs a rental order id.
Important notes

---

## Page 24

Aiven Rental App User Manual
Page 24
G
Monthly charges are useful for long-term rentals and recurring billing review.
Implemented monthly-charge behavior
G
Monthly recurring calculations use each line's effective date range. If actual pickup exists, it is used instead of booked
start. If actual return exists, it is used instead of booked end.
G
Daily lines are converted to a monthly recurring estimate by using the daily rate for up to 30 days.
G
Weekly lines are converted to a monthly recurring estimate by using the weekly rate for up to 30 days divided by 7.
G
Monthly lines use the line amount divided by the computed monthly units for the line date range.
G
The app applies company billing settings when calculating line amounts and monthly units, including monthly proration
method, billing time zone, rounding mode, and rounding granularity.
G
The recurring total is calculated from the recurring subtotal with the app's current 5 percent total multiplier.
G
The recurring section is shown only when there is a meaningful recurring subtotal. If all lines use one basis, very short
periods may not show recurring: daily needs more than 1 day, weekly needs more than 7 days, and monthly needs more than
1 month. Mixed-basis orders show recurring when the subtotal is greater than zero.
G
If monthly charges look wrong, correct the line dates, actual pickup/return dates, period, rate, or company billing
settings, then save the order again.
Screenshot: Rental Order / Quote - Monthly Charges

Image file: `screenshots/p24_01_rental_order_quote_monthly_charges.png`


Rental Order / Quote - Customer Update Page
Purpose: Prepare a customer-facing update view for a rental order or quote.
How to use it
1
Open the rental order or quote.
2
Use the Customer edits button to review submitted customer edits, or use Generate customer link from the order form to
create a customer-facing link.
3
Review what information will be visible to the customer.
4
Confirm customer, site, dates, line items, and instructions are correct.
5
Click Generate customer link.
6
Copy the generated Share link field, then send the link to the customer using email or your normal communication
channel.
Mandatory information / rules
G
Saved records generate an `order_update` customer link tied to the rental order. Unsaved quote forms generate a
`new_quote` customer link.
G
Customer-facing order links can require typed name, signature, and service agreement acknowledgement when company
settings require them.
G
For customer-submitted quote/order data, the customer must submit at least one line item. For new-customer or new-quote
links without an existing customer, customer name is required.
Optional but useful information
G
Links generated from the order and customer forms are single-use. Customer share links expire after 7 days by default
unless the app is configured to create a different expiry.
Important notes
G
Do not send the link until the order details are accurate enough for the customer to see.
G
Customer submissions do not silently overwrite the rental order. They create customer change requests that staff review
and accept or reject. Staff can accept customer fields separately from order fields, and can choose which submitted line
item changes to apply.
G
An accepted `new_quote` request can create a new quote. An accepted `order_update` request merges accepted fields into
the existing order. Rejected requests remain as review history and do not change the customer or order.

---

## Page 25

Aiven Rental App User Manual
Page 25
Screenshot: Rental Order / Quote - Customer Update Page

Image file: `screenshots/p25_01_rental_order_quote_customer_update_page.png`


Customer Link Page for Rental Order / Quote
Purpose: Let a customer view or update allowed order information without giving them full app access.
How to use it
1
Generate or copy the customer link from the rental order, quote, or customer update page.
2
Send the link to the customer.
3
The customer opens the link and reviews the visible order/quote details.
4
The customer submits allowed changes. Order links allow customer fields, order fields, line item fields (`lineItemId`,
`typeId`, `bundleId`, `startAt`, `endAt`), configured document categories, and e-signature when required.
5
Back in the app, review customer edits before treating them as final.
Mandatory information / rules
G
A saved order produces an `order_update` link. Generating from an unsaved quote form produces a `new_quote` link and
does not attach the link to an existing rental order id.
G
The customer link can submit customer fields, allowed order fields, line item type/bundle/date changes, configured
document uploads, general-note images, and e-signature proof. It cannot assign internal inventory units.
G
The line item data accepted from the customer is limited to allowed line-item fields such as line item id, equipment type,
bundle, start date, and end date. Staff still control unit assignment, status changes, and operational pickup/return dates
inside the app.
Optional but useful information
G
A single-use link closes after submission. Used links show a Thank you message and can expose the proof PDF link when a
proof was generated.
G
Customer-facing order links can expose assigned unit location information when the order has assigned units with current
locations. If the customer-facing unit-pin workflow is used, the submitted pin creates a non-base location, assigns it to
that unit as Current location, and writes a location-history entry. The app validates that the unit belongs to the linked
order before accepting the pin.
G
The generated proof PDF records the submitted customer/order/line-item data and uploaded documents for review history.
Important notes
G
Customer links should be treated as external-facing. Review them before sending and avoid exposing internal notes that
should remain private.
G
Because links are single-use, do not use a customer's submitted link as a reusable edit page. Generate a new link when a
new customer update cycle is needed.

---

## Page 26

Aiven Rental App User Manual
Page 26
Screenshot: Customer Link Page for Rental Order / Quote (1)

Image file: `screenshots/p26_01_customer_link_page_for_rental_order_quote_1.png`


Screenshot: Customer Link Page for Rental Order / Quote (2)

Image file: `screenshots/p26_02_customer_link_page_for_rental_order_quote_2.png`



---

## Page 27

Aiven Rental App User Manual
Page 27
6. Monthly Charges
Monthly Charges Page
Purpose: Review customer-level rental charges for a selected calendar month. This page is a prorated monthly billing
review: it adds the portions of rental line items that fall inside the selected month, subtracts paused time, and adds
fees dated in that same month.
How to use it
1
Open the Monthly Charges page from the finance/operations navigation.
2
Choose the month in the Month picker. The page defaults to the current month in the company's billing time zone unless a
valid month is provided in the page URL.
3
Choose the order statuses you want included. By default, Requested, Reservation, and Ordered are selected. Received and
Closed are available but not selected by default.
4
Review the top summary for the selected month's total, number of customers with charges, number of included orders, and
number of selected statuses.
5
Use the month bar to compare the months in the selected year. Clicking a month changes the selected month. The bar uses
the same status filters as the main table.
6
Review the customer rows. Columns show Customer, Orders, Line items, Fees, and Total. The columns can be sorted.
7
Search by customer name, order count, line-item amount, fees amount, or total when you need to narrow the list.
8
Click a customer row to expand the customer detail. The expanded panel lists each contributing order, its status, start,
end, line item total, fees total, total, and an Open link.
9
Open the individual rental order when a total needs correction. Changes are made on the rental order, not directly on the
Monthly Charges page.
Mandatory information / rules
G
No fields are required to view the page.
G
At least one status must be selected for the page to calculate totals. If every status checkbox is cleared, the page will
show a message asking you to select at least one status.
G
Only rental orders are included. Quote and rejected quote records are not part of this page's status filters.
Optional but useful information
G
Use the status filters to decide whether the page represents pipeline demand, active rental billing, or historical
billing. Requested and Reservation show future/planned demand, Ordered shows active orders, and Received/Closed add
returned or finalized historical orders.
G
Use the order-level Monthly Charges view from an individual rental order when you need a month-by-month breakdown for one
order. The customer Monthly Charges page groups many orders by customer.
Important notes
G
This page is a summary. Corrections should usually be made inside the individual rental order by adjusting customer,
status, line dates, actual pickup/return dates, selected units, rate period, rate amount, pauses, or fees.
G
This page does not simply display the stored monthly recurring total from the rental order list. It recalculates the
selected month's prorated customer total in the browser from the order detail, line items, pause periods, and dated fees.
Stored monthly recurring values on rental orders are recurring estimates used elsewhere in the app and may include
different display rules.
G
The page loads rental orders whose rental period overlaps the selected month, and it also asks for fees dated inside that
month. It then fetches each matching order's full detail before calculating customer totals.
G
The selected status filters are applied before totals are calculated. If an expected order is missing, first check whether
its status is selected. Received and Closed are not included unless those checkboxes are turned on.
G
Requested orders can appear when they have dates and rates because Requested is selected by default. If you only want
active billed work, clear Requested and Reservation and leave Ordered selected, adding Received or Closed only when
reviewing returned or finalized work.
G
Fees count only when they have a fee date in the selected month. Fees with no date, or fees dated in another month, do not
increase the selected month's customer total on this page.
G
Customers may appear with zero totals because the page also loads the customer list. The summary distinguishes customers
with charges from all loaded customer rows.
How the monthly charge calculation works
G
Line item start date: the page uses the actual fulfilled/pickup date when present. If there is no fulfilled date, it uses
the scheduled line item start date.
G
Line item end date: the page uses the actual returned date when present. If there is no returned date, it uses the
scheduled line item end date. When an unreturned item has a scheduled end date in the past, the page treats it as ongoing
through the current time so the month reflects the still-open rental.
G
Open lines are flagged in the page message with "Includes ongoing items through ..." so users know the total depends on
today's current time.
G
Paused time is subtracted from line item billing time. Overlapping pause periods are merged before the total active time
is calculated. An open-ended pause is treated as paused through the end of the line's calculated range.
G
The line's active time is split across calendar months using the company's billing time zone. Only the part that falls
inside the selected month is included.
G
The customer page is a prorated view with no rounding. It does not round daily, weekly, or monthly units up to full
billing units for this screen. This is why partial-month amounts can have fractional unit logic behind the displayed
dollar amount.
G
For monthly rates, the company monthly proration setting controls whether the fraction is based on hours in the month or
days in the month. The default behavior is hour-based proration when the setting is missing.
G
For weekly rates, the page calculates active days divided by seven. For daily rates, it calculates active days. Amounts
are then multiplied by the rate amount and quantity.
G
Quantity is based on the line item implementation. A bundle line counts as quantity 1. A normal line with selected
inventory counts the number of selected units. If no inventory is selected, the page falls back to quantity 1.
G
Line item amounts and order totals are rounded to cents for display and summing.
Why a monthly total may be missing, zero, or unexpected
G
The order status may not be selected in the filter bar.
G
The order may be a quote. Quotes are intentionally excluded from this customer monthly charge page.
G
The line item may not overlap the selected month after actual pickup, return, scheduled dates, and pause periods are
applied.
G
The line item may be missing a valid rate period, rate amount, start date, or end date. Lines with invalid calculation
inputs are skipped, which can make a customer or order total lower than expected.
G
The item may still be open after its scheduled end date. In that case, the page charges it through the current time until
an actual return is recorded.
G
The fee may be undated or dated outside the selected month. Only fees dated in the selected month are included.
G
The company's billing time zone can move a late-night start or return into a different billing day/month than expected.
G
The total may differ from the rental order's stored monthly recurring total. This page is month-specific and prorated by
actual time in the selected month; stored monthly recurring fields are recurring display values used in other order
summaries.
G
The month bar and table use the currently selected status filters. Changing statuses can change both the selected month
total and the year bar totals.
G
If totals look stale after editing an order, return to the page and use Refresh so the page reloads order and customer
details.
Customer and order detail behavior
G
Customer rows are sorted by total from highest to lowest by default. Clicking a column header changes the sort.
G
The customer detail panel sorts that customer's contributing orders by order total from highest to lowest.
G
The Open link goes to the rental order so line items, dates, rates, fees, customer information, and status can be
corrected at the source.
G
The page protects against stale loading results. If you change month or filters while a previous load is still running,
the older result is ignored when the newer request finishes.
G
Short one-off rentals can still appear when part of their active rental period falls in the selected month and their
status is selected. However, the page is intended for monthly billing review, so it is most useful when users understand
that dates, actual returns, pauses, and fees drive the result.
Screenshot: Monthly Charges Page

Image file: `screenshots/p27_01_monthly_charges_page.png`



---

## Page 28

Aiven Rental App User Manual
Page 28
7. Work Orders and Parts
Work Orders Table View
Purpose: Find, review, and create maintenance or service tasks for assets.
How to use it
1
Click Work Orders in the side navigation.
2
Review the table for work order number, units, service status, order status, due date, customer/order link, and summary.
3
Use search to find work orders by unit, work order number, service status, order status, customer/order details, or work
summary.
4
Click a row to open the work order detail page.
5
Click New Work Order to create a service task.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
Use search to focus on the work orders relevant to a unit, customer, service status, order status, or task.
Important notes
G
Work orders are the operational record for repair, preventive maintenance, inspections, parts use, and labor.
Screenshot: Work Orders Table View

Image file: `screenshots/p28_01_work_orders_table_view.png`


Work Order Detail View
Purpose: Create and manage a specific maintenance or repair task.
How to use it
1
Open Work Orders and click New Work Order, or open an existing row.
2
Select the asset/unit or equipment being serviced.
3
Choose Service status (`in_service` or `out_of_service`) and enter Category when needed.
4
Link the work order to a rental order and customer when the work belongs to a customer job.
5
Review Created date and enter Due date.
6
Enter Task at hand and Describe the work done.
7
Add parts used in the parts section.

---

## Page 29

Aiven Rental App User Manual
Page 29
8
Add labor lines with Hours and Work done.
9
Use the Recurring checkbox, Every value, and Frequency (`days`, `weeks`, or `months`) when the work repeats.
10
Save the work order.
Mandatory information / rules
G
Saving requires at least one selected unit. Work summary fields are supported, but the app's hard save validation is the
unit selection.
Optional but useful information
G
Rental order link, customer, category, site name, site address, site pin/access code, contact, parts, labor, recurrence, and
notes are optional fields on the work order.
Important notes
G
Link work orders to rental orders whenever service is connected to a specific rental. Leave it blank for general yard
maintenance or internal repairs.
Screenshot: Work Order Detail View (1)

Image file: `screenshots/p29_01_work_order_detail_view_1.png`


Screenshot: Work Order Detail View (2)

Image file: `screenshots/p29_02_work_order_detail_view_2.png`



---

## Page 30

Aiven Rental App User Manual
Page 30
Screenshot: Work Order Detail View (3)

Image file: `screenshots/p30_01_work_order_detail_view_3.png`


Parts
Purpose: Maintain the parts inventory used in repairs and work orders.
How to use it
1
Open Parts from the side navigation.
2
Search for an existing part by part number, name, or description.
3
Click New part to create a new item.
4
Enter the part number.
5
Add description, unit of measure, and unit cost.
6
Save the part.
7
Use the part on work orders when it is consumed or installed.
Mandatory information / rules
G
Part number is required.
Optional but useful information
G
Description, unit of measure, and unit cost are optional.
Important notes
G
Clean part numbers make work orders and inventory counts much easier to maintain.

---

## Page 31

Aiven Rental App User Manual
Page 31
Screenshot: Parts

Image file: `screenshots/p31_01_parts.png`



---

## Page 32

Aiven Rental App User Manual
Page 32
8. Assets, Equipment, and Locations
Assets Table View
Purpose: View and manage individual rentable units/assets.
How to use it
1
Open Assets from the side navigation.
2
Use search and filters to find assets by type, model, serial number, status, or location.
3
Review the assets table.
4
Use search and the visible table controls to narrow the asset list.
5
Open the asset row you need to edit.
6
Click an asset row to open the asset detail page.
7
Click Add Equipment/Asset to create a new asset.
What the table fields mean
G
Location/Base location is the asset's normal yard, branch, or home location.
G
Current location is where the asset is currently tracked. If the asset has no separate current-location id, the table shows
the base location fallback or "Same as base location" behavior instead of requiring a duplicate current-location value.
G
Availability status is calculated from rental-order line assignments and dates. A unit can be Available, Reserved, Rented
out, or Overdue depending on active/requested/reserved/ordered rental line items.
G
Return inspection and Out of service can appear on the asset list when the unit has a non-closed work order marked for
return inspection or out-of-service service status. Return inspection takes display priority over ordinary out-of-service
because it is a specific reason the unit is being held back after return.
G
Search checks asset type, model, serial number, condition, manufacturer, base location, current location address/name,
availability, bundle name, notes, rental order number, customer name, and rental site address fields.
Asset status logic
G
Available means the app did not find an active rental assignment, active reservation/request assignment, overdue rental,
or non-closed return-inspection/out-of-service work order for the unit.
G
Reserved means the unit is assigned to a `reservation` or `requested` rental order whose line end is still in the future.
The table can show the related RO/request context when one exists.
G
Rented out means the unit is assigned to an `ordered` rental order and the current time falls inside the effective rental
window. The effective start is actual pickup/delivery when present, otherwise booked start. The effective end is actual
return when present, otherwise the later of booked end or now while the unit is still out.
G
Overdue means the unit is assigned to an `ordered` rental order, the line has not been returned, and the booked end is in
the past.
G
Return inspection means there is a non-closed work order with Return inspection checked for the unit. In the work order
form, checking Return inspection sets service status to `out_of_service`.
G
Out of service means there is a non-closed work order whose service status is `out_of_service`. Out-of-service blocks are
also written to the equipment out-of-service table when the work order pause/block sync runs.
G
Condition is separate from status. Conditions such as New, Normal Wear & Tear, Damaged but Usable, Needs Repair,
Unusable, and Lost describe the asset. They are not the same as rental availability. To reliably block booking, use the
out-of-service/return-inspection work order workflow.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
Column customization is optional but useful for operations, sales, and maintenance users who care about different fields.
G
The table can switch between table and card views. Search and sort choices are stored locally in the browser so a user can
return to the same working view.
Important notes
G
The Assets page tracks individual physical units, while Equipment/Types define categories or models.
G
The table can show a unit with a current-location label even when the exact map coordinates are missing. Map plotting still
requires coordinates on the current location or base location.
G
Asset status is computed. It is not a normal editable field on the asset form. If the status is wrong, inspect the rental
order assignment, actual return date, work order service status, return inspection flag, and current-location data.
Screenshot: Assets Table View

Image file: `screenshots/p32_01_assets_table_view.png`



---

## Page 33

Aiven Rental App User Manual
Page 33
Asset Detail View
Purpose: Create or update a specific physical asset/unit.
How to use it
1
Open Assets and click an existing asset, or click Add Equipment/Asset.
2
Select the equipment type.
3
Enter the model name.
4
Enter the serial number.
5
Add condition, manufacturer, purchase price, base location, current location, images, bundle details, directions, notes,
location history, and work order review as needed.
6
Use the current location tools when the asset is at a yard, customer site, or other location.
7
Save the asset.
Implemented field behavior
G
Type of equipment, model name, and serial number are required by the current API. Condition is optional in the current
asset save flow even though older database schema text may imply it is required.
G
The available condition values in the UI are Not set, New, Normal Wear & Tear, Damaged but Usable, Needs Repair,
Unusable, and Lost. This field is informational for the asset record. Use a work order with out-of-service status when the
unit must be removed from rental availability.
G
Base location is optional. It should be a base location such as a yard or branch. Selecting "+ Add new location..." from the
asset form creates a base location by default.
G
Current location is optional and separate from Base location. Leaving it blank means "Same as base location" in the UI.
Clearing current location removes the separate current-location value; it does not delete or change the base location.
G
Picking a current location on the map creates or reuses a location id and stores that id on the asset as Current location.
For a saved asset, using the picker can update the current location immediately. Saving the asset afterward also persists
the visible asset fields.
G
Changing Current location records a Location history entry with from/to labels and coordinates where available. Changing
Base location alone does not mean the app has physically moved the asset unless Current location is also changed or
cleared.
G
Directions appear only when the company setting for asset directions is enabled. When enabled, a location change can
prompt for directions; the saved directions live on the asset record.
G
Images can be stored directly on the asset. If the asset has no asset-specific images, the detail page can show inherited
equipment type images as a fallback. A card image can be selected for the asset display.
G
Asset images and equipment type images are separate. Removing an asset image does not remove the equipment type image
that may still appear as a fallback.
G
The asset detail page includes Location history and Work orders in the extras drawer. Location history shows current
location changes. Work orders show service/inspection records connected to the unit.
G
Changing an asset's equipment type can update non-closed rental order line items that are assigned only to that one unit,
so the line item type stays aligned with the asset. Closed orders are not rewritten by this sync.
Mandatory information / rules
G
Asset type, model name, and serial number are required.
Optional but useful information
G
Images, condition, manufacturer, purchase price, base location, current location, directions, bundle membership, notes, and
work order history are optional.
G
Manufacturer, purchase price, and notes are saved on the asset and do not affect rental availability.
Why an asset may not save or may not behave as expected
G
The app requires a company context, equipment type or type name, model name, and serial number.
G
Condition, manufacturer, purchase price, base location, current location, images, notes, and directions can be blank.
G
Directions are saved only when the company's asset-directions setting is enabled. When that setting is disabled, submitted
directions are ignored or preserved from the existing record rather than newly applied from the form.
G
If a newly added asset does not appear on a map, check whether its Current location or Base location has latitude and
longitude. A text-only location can still appear in tables but cannot draw a map marker.
G
If a unit still appears rented, reserved, overdue, return inspection, or out of service after edits, the reason is usually a
rental order line assignment or a non-closed work order, not a field on the asset form itself.
Important notes
G
Assets are the actual units assigned to rental order line items. Keep serial numbers and locations accurate.
G
For new assets, if Current location is left blank and Base location is filled, the asset behaves as located at base for display
and map fallback. For a return-to-base workflow, the backend may explicitly set Current location to the same location id as
Base location.
G
Deleting an asset removes that equipment record and removes its saved rental-order inventory assignments. If the deleted
asset was the only item in a bundle, empty bundle records are cleaned up. Do not delete an asset just to make it
temporarily unavailable; use condition notes and out-of-service work orders instead.
G
Purchase orders can create assets when closed. A PO must have model name, serial number, condition, manufacturer, base
location, and purchase price before the PO can close and create the asset.
Screenshot: Asset Detail View

Image file: `screenshots/p33_01_asset_detail_view.png`


Asset Detail - Current Location Map Popup
Purpose: Set or review the asset's current physical location on a map.

---

## Page 34

Aiven Rental App User Manual
Page 34
How to use it
1
Open the asset detail page.
2
Open the current location map popup.
3
Search for or select the asset's current location.
4
Confirm the address or map marker is correct.
5
Save the location.
6
Return to the asset detail page and confirm the current location updated.
Implemented behavior
G
The picker starts from the asset's existing Current location when one exists. If there is no current location, it tries the
base location. If neither has coordinates, it may ask the browser for device geolocation and otherwise opens at a broad
world view.
G
Search suggestions depend on the selected map provider. Google provider uses Google Maps/Places and requires a valid
Google Maps API key for the map to load. Leaflet provider uses OpenStreetMap tiles and the app's Nominatim-backed
address search endpoint.
G
Clicking the map drops a draggable/manual pin. Choosing a search result uses the result coordinates and label. The app
saves the chosen point as a location record and sets that location as the asset's Current location.
G
New map-picked current locations are created as non-base locations. They are intended for jobsites, customer yards,
temporary staging areas, and one-off pins, so they do not appear as normal base-yard options.
G
If the picker is opened on an existing current location and saved without choosing a new point, the app reuses the existing
location id instead of creating a duplicate.
Mandatory information / rules
G
Current location is optional. If it is left blank, the asset uses Same as base location.
Optional but useful information
G
Use Directions for entrance details, gate codes, approach route, staging area, and other field-crew instructions.
Important notes
G
When assets move through rental order pickup/return workflows, their current location should match the rental order or
home base movement.
G
If a map search fails, a manual pin can still be saved. If the map provider itself fails to load, check the map provider
setting, Google key status, browser network access, and the public config.
G
Current-location updates can clean up unused non-base locations after the unit moves away from them. This keeps one-off
jobsite pins from accumulating as ordinary base locations.
Screenshot: Asset Detail - Current Location Map Popup

Image file: `screenshots/p34_01_asset_detail_current_location_map_popup.png`


Asset Detail - Bundle Popup
Purpose: Manage bundled assets or components that are rented or tracked together.

---

## Page 35

Aiven Rental App User Manual
Page 35
How to use it
1
Open the asset detail page.
2
Open the bundle popup.
3
Add child assets or components that belong in the bundle.
4
Remove components that no longer belong.
5
Review the full bundle list before saving.
6
Save the bundle.
Mandatory information / rules
G
Bundle name is required when saving a bundle.
G
A bundle must include at least one asset.
G
An asset can belong to only one bundle at a time. The bundle item checklist disables assets that already belong to another
bundle.
G
The primary equipment must be one of the selected bundle items. If the chosen primary item is not in the selected list,
the app uses the first selected asset as the effective primary item.
Optional but useful information
G
Bundle components are selected from the Bundle items checklist. Daily, weekly, and monthly bundle rates are optional.
G
If a bundle rate is blank, bundle lists and rental-line suggestions fall back to the primary equipment type's matching
default rate when one exists.
G
Bundle rates can be daily, weekly, and monthly. On rental order lines, the default period for a bundle is monthly when a
monthly rate exists, then weekly when a weekly rate exists, then daily when a daily rate exists, otherwise monthly.
Important notes
G
Bundles are useful for systems made of multiple trackable units, such as trailers with attached equipment or package
rentals.
G
Bundles are created and edited from a saved asset. A new unsaved asset must be saved before the bundle popup can manage
it.
G
In rental orders, a bundle line rents the bundle as one line item. The app still checks every asset inside the bundle for
overlapping rental assignments and out-of-service blocks.
G
A bundle is unavailable when any bundled asset is assigned to an overlapping `requested`, `reservation`, or `ordered`
rental order, or when any bundled asset has an overlapping out-of-service period.
G
Deleting a bundle removes the bundle relationship, not the asset records themselves. The individual assets remain in the
Assets list.
Why a bundle may not save or may not be usable on an order
G
The bundle has no name.
G
No bundle items are selected.
G
One or more selected assets no longer exist for the company.
G
One or more selected assets already belong to another bundle.
G
The bundle is saved but has no rate and the primary equipment type also has no matching default rate. The bundle can
still exist, but rental line pricing may need to be entered manually.
G
The bundle is selected on a rental order but one of its assets is already booked, rented, requested, reserved, overdue, or
out of service during the selected rental dates.
Screenshot: Asset Detail - Bundle Popup

Image file: `screenshots/p35_01_asset_detail_bundle_popup.png`


Equipment Page Table View
Purpose: Manage equipment categories, types, or models used to create assets and line items.

---

## Page 36

Aiven Rental App User Manual
Page 36
How to use it
1
Open Equipment from the side navigation.
2
Review existing equipment types/models.
3
Use search to find an equipment type/model.
4
Click an equipment row to open its detail page.
5
Click Add Equipment Type or the equivalent button to create a new type.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
Use this page to keep model/type naming consistent across quotes, rental orders, and assets.
G
The table shows image, type name, category, daily rate, weekly rate, monthly rate, and in-stock count. The in-stock count
comes from the number of assets assigned to the type.
G
The table can be viewed as rows or cards. Search checks type name, category, description, and terms.
G
Inventory import can create or update equipment types and create asset records from an import file. The import reports
how many types were created or updated and how many equipment records were created or skipped.
Important notes
G
Equipment types are not the same as individual assets. A type describes what the item is; an asset is the specific
serial-numbered unit.
G
Rental order line items start from equipment types. Assets are selected later only when the order status allows or
requires a unit.
Screenshot: Equipment Page Table View

Image file: `screenshots/p36_01_equipment_page_table_view.png`


Equipment Detail Page
Purpose: Create or edit an equipment type/model used by assets and rental line items.
How to use it
1
Open Equipment.
2
Click an existing equipment type or create a new one.
3
Enter the type/model name.
4
Add images, category, description, terms, PDF documents, daily rate, weekly rate, monthly rate, and QBO item.
5
Save the equipment type.
6
Use this type when creating assets or rental order line items.
Mandatory information / rules
G
Equipment name is required.

---

## Page 37

Aiven Rental App User Manual
Page 37
Optional but useful information
G
Category, description, image, PDF documents, default rates, terms, and QBO item are optional but useful for quoting and
asset setup.
Implemented equipment type behavior
G
Equipment name is unique per company. Creating a type with an existing name returns an "already exists" message instead
of creating a duplicate type.
G
Images on an equipment type are used for the type list and can be inherited by assets that do not have their own
asset-specific images.
G
PDF documents on an equipment type are intended for spec sheets, manuals, certifications, or other type-level reference
documents. They are not the same as rental order attachments or before/after documents.
G
Daily, weekly, and monthly rates are default type rates. Rental order lines use these as suggestions unless customer
special pricing or bundle rates apply. Users can still override the line rate on the rental order.
G
The rental order form chooses the default rate basis for a type in this order: monthly if monthly rate exists, otherwise
weekly if weekly rate exists, otherwise daily if daily rate exists, otherwise monthly with no default amount.
G
QBO Item links an equipment type to a QuickBooks Online item when QBO is connected. If company settings hide QBO
sections while disconnected, the QBO section may be hidden until the company connects QBO.
G
The stock chart on a saved equipment type shows available stock by location for the selected number of days. It uses the
same availability logic as the rest of the app, including rental assignments, projected demand, and out-of-service blocks
where the chart options include them.
G
Deleting an equipment type should be treated carefully because assets and historical records may reference it. Prefer
renaming or correcting a type when existing assets already use it.
Why an equipment type may not save or may not price as expected
G
Equipment name is required.
G
Creating a duplicate equipment name for the same company does not create a second type.
G
Blank rate fields are saved as blank. If no matching type, customer, or bundle rate exists, the rental order line can still be
created, but the rate amount may need to be entered manually.
G
Customer-specific pricing overrides type defaults on rental order rate suggestions when the selected customer has pricing
for that equipment type and rate basis.
G
Bundle pricing overrides type pricing when the selected rental line is a bundle and the bundle has a matching rate.
Return inspection and out-of-service behavior
G
Return inspection is handled through work orders, not directly through the asset condition field. When Return inspection is
checked on a work order, the work order service status is forced to `out_of_service`.
G
An open or completed but not closed return-inspection work order makes the asset appear with Return inspection status on
the Assets page.
G
An open or completed but not closed out-of-service work order makes the asset appear Out of service on the Assets page.
G
When the work order/out-of-service sync runs, it writes an equipment out-of-service block with a start date. That block
prevents the unit, and any bundle containing the unit, from being available for overlapping rental order dates.
G
Closing the work order supplies an end date for the out-of-service block. After the work order is closed and the block has
ended, the unit can become available again if no rental assignment, overdue rental, or other out-of-service block is still
active.
G
Changing an asset's Condition to Needs Repair, Unusable, or Lost is useful recordkeeping, but it is not the same as
creating a return-inspection or out-of-service work order. Use the work order workflow when availability must be blocked.
Important notes
G
Good equipment type data speeds up new asset creation and makes quotes more consistent.
Screenshot: Equipment Detail Page

Image file: `screenshots/p37_01_equipment_detail_page.png`


Location Table View
Purpose: Manage yards, branches, customer sites, or other named locations.
How to use it
1
Open Locations from the side navigation.
2
Review the table of saved locations.
3
Search for a branch, yard, site, or address.
4
Click a row to open the location detail page.
5
Click Add Location to create a new location.
What appears here
G
The normal Locations table loads base locations. These are the locations intended to be selected as an asset Base
location, pickup yard, branch, or operating location.
G
Non-base locations are still real records, but they are used mostly behind the scenes for current-location pins, order site
locations, drop-off addresses, customer-link unit pins, and imported map pins.
G
The map view can show Units or Locations. Units are plotted from current-location coordinates first and base-location
coordinates second. Locations are plotted from the saved location latitude/longitude.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
Use locations to organize equipment by yard, branch, or operating area.
Important notes
G
Clean location records improve map views, dispatch planning, and asset current-location accuracy.
G
A location can be operationally valid without a map point, but it will not display as a marker until it has coordinates.

---

## Page 38

Aiven Rental App User Manual
Page 38
Screenshot: Location Table View

Image file: `screenshots/p38_01_location_table_view.png`


Location Detail View
Purpose: Create or update a named location.
How to use it
1
Open Locations and click Add Location, or open an existing location.
2
Enter the location name.
3
Search for an address, geocode it, or click the map to set the map position. Enter Name, Street, City, Region, and Country.
4
Use the Base location checkbox when the location should show on the Locations list/map as a base location.
5
Save the location.
Implemented behavior
G
New locations created from the Locations page are base locations unless the Base location checkbox is cleared.
G
Location name must be unique within the company. Creating a location with an existing company/name combination updates
the existing row instead of creating a duplicate in some API flows.
G
Street, city, region, and country are saved separately from coordinates. On save, the backend attempts to geocode the
address through Nominatim when manual coordinates are not supplied and an address query can be built.
G
If the user clicks the map or chooses a search result, those coordinates are saved directly with the location.
G
Editing an address can trigger re-geocoding when the address changes or coordinates are missing. Manual coordinates from
the map/picker take precedence over automatic geocoding.
G
The Base location flag controls whether the record appears in base-location selectors and the default location list. It does
not by itself move any asset.
Mandatory information / rules
G
Location name is required.
Optional but useful information
G
Street, city, region, country, map position, and base-location flag are optional but strongly recommended for operational
use.
Important notes
G
Use consistent naming for yards and branches so staff can quickly recognize where equipment belongs.
G
Avoid turning temporary jobsite/current-location pins into base locations unless staff should be able to select them as
normal yards or branches.
Screenshot: Location Detail View (1)

Image file: `screenshots/p38_02_location_detail_view_1.png`



---

## Page 39

Aiven Rental App User Manual
Page 39
Screenshot: Location Detail View (2)

Image file: `screenshots/p39_01_location_detail_view_2.png`



---

## Page 40

Aiven Rental App User Manual
Page 40
9. Purchase Orders, Sales Orders, and Vendors
Purchase Order Table View
Purpose: Track purchase orders for acquiring equipment or inventory.
How to use it
1
Open Purchase Orders from the app.
2
Review the PO table for vendor, equipment type, dates, status, and totals.
3
Search or filter to find a PO.
4
Click a row to open the purchase order detail page.
5
Click New Purchase Order to create a new PO.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
Purchase order status is stored as open or closed. The form shows Close for open purchase orders and Open for closed
purchase orders.
Important notes
G
Purchase orders are useful when assets are being bought before they become available for rental.
Screenshot: Purchase Order Table View

Image file: `screenshots/p40_01_purchase_order_table_view.png`


Purchase Order Detail View
Purpose: Create or edit a purchase order.
How to use it
1
Open Purchase Orders and click New Purchase Order, or open an existing PO.
2
Select the vendor.
3
Select the equipment type or item being purchased.
4
Enter the expected possession/received date.
5
Add model name, serial number, condition, manufacturer, images, base location, current location, purchase price, and notes.
Current location is optional. If a PO is closed without a separate current location, the new asset is created with Base
location filled and Current location blank, which the UI treats as Same as base location.
6
Save the purchase order.
7
When equipment is received, close the purchase order. Closing creates the asset on the Assets page after all close-required
asset details are present.
Mandatory information / rules
G
Vendor, equipment type, and expected possession date are required to save a purchase order.

---

## Page 41

Aiven Rental App User Manual
Page 41
Optional but useful information
G
Model name, serial number, condition, manufacturer, base location, and purchase price are required to close a PO and add
the asset. Images, current location, and notes are optional.
G
Closing a PO creates the asset only after the close-required asset fields pass validation. If a Current location was selected
on the PO, that current-location id is copied to the created asset and an initial location-history row is recorded. If it was
left blank, no separate current-location row is written; map views can still use the base location coordinates.
Important notes
G
Do not treat a PO as rentable inventory until the purchased equipment has been received and added as an asset.
Screenshot: Purchase Order Detail View

Image file: `screenshots/p41_01_purchase_order_detail_view.png`


Sales Order Detail View
Purpose: Record the sale of an asset or item out of inventory.
How to use it
1
Open Sales Orders.
2
Create a new sales order or open an existing one.
3
Select the asset being sold.
4
Select customer, enter customer PO, salesperson, sale price, description, images, and PDF documents.
5
Review the order carefully because selling an asset may remove it from rental availability.
6
Save the sales order.
Mandatory information / rules
G
An active company context and asset selection are required. The app supplies company context from the logged-in session;
the user-visible required field is Unit / Asset.
Optional but useful information
G
Customer, customer PO, salesperson, sale price, description, images, and PDF document are optional.
Important notes

---

## Page 42

Aiven Rental App User Manual
Page 42
G
Only use sales orders for assets that are truly being sold, not rented.
Screenshot: Sales Order Detail View

Image file: `screenshots/p42_01_sales_order_detail_view.png`


Vendor Detail View
Purpose: Create or edit vendor records used for purchases, parts, re-rents, or services.
How to use it
1
Open Vendors.
2
Click Add Vendor or open an existing vendor.
3
Enter the vendor name.
4
Add contact name, email, phone, street address, city, province/state, country, postal code, and notes.
5
Save the vendor.
6
Use the vendor on purchase orders, parts, or re-rent lines as needed.
Mandatory information / rules
G
Vendor name is required.
Optional but useful information
G
Contact details, address, payment terms, notes, and categories are optional but useful.
Important notes
G
Clean vendor records reduce duplicate vendors and make purchase history easier to follow.

---

## Page 43

Aiven Rental App User Manual
Page 43
Screenshot: Vendor Detail View

Image file: `screenshots/p43_01_vendor_detail_view.png`



---

## Page 44

Aiven Rental App User Manual
Page 44
10. Customers and QuickBooks Sync
Customer Table View
Purpose: Find, create, import, sync, and open customer records.
How to use it
1
Open Customers from the side navigation.
2
Search for a company or contact.
3
Use filters or table columns to locate the right customer.
4
Click a row to open the customer detail page.
5
Click New Customer to create a new customer.
6
Use Import to add customers from a file.
7
Use QBO sync to match, link, or import QuickBooks Online customers when QuickBooks credentials are connected.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
Customer imports require a selected company and an uploaded file. QBO sync requires QuickBooks Online connection
settings and company context.
Important notes
G
Before creating a duplicate customer, search by company name, contact name, email, and phone.
Screenshot: Customer Table View

Image file: `screenshots/p44_01_customer_table_view.png`


Customer QuickBooks Online Sync
Purpose: Match or sync customer records with QuickBooks Online when QBO is enabled.

---

## Page 45

Aiven Rental App User Manual
Page 45
How to use it
1
Open Customers.
2
Open the QBO sync workflow.
3
Review suggested matches between app customers and QBO customers.
4
Confirm matches carefully before syncing.
5
Resolve duplicates or unmatched records.
6
Complete the sync and return to the customer table.
Mandatory information / rules
G
QuickBooks must be connected for QBO customer records to load.
Optional but useful information
G
Use the QBO customer workflow to link an existing local customer to a QBO customer, import an unlinked QBO customer,
or skip records already linked.
Important notes
G
Be careful with QBO sync because customer names, billing addresses, and accounting records may affect invoicing.
Screenshot: Customer QuickBooks Online Sync

Image file: `screenshots/p45_01_customer_quickbooks_online_sync.png`


Customer Detail View
Purpose: Create or update a customer profile used for quotes, rental orders, billing, contacts, and customer-facing links.
How to use it
1
Open Customers and click New Customer, or open an existing customer.
2
Choose Customer type. For Standalone, enter Company name. For Branch, choose Parent customer and enter Branch name.
3
Enter QBO Customer ID when you need to store the QuickBooks customer id manually.

---

## Page 46

Aiven Rental App User Manual
Page 46
4
Add contact categories, street address, city, province/state, country, postal code, follow up date, sales person, and general
notes.
5
Add one or more contacts with name, role/title, email, and phone.
6
Set Charge Deposit when deposits are allowed for the customer.
7
Add special pricing by selecting Equipment type and entering daily, weekly, and monthly rates.
8
Save the customer.
Mandatory information / rules
G
Standalone customers require Company name. Branch customers require Parent customer and Branch name.
Optional but useful information
G
Contact categories, street address, city, province/state, country, postal code, follow up date, sales person, general notes,
special pricing, Charge Deposit, and QBO Customer ID are optional.
Important notes
G
A saved customer record is required before the customer can be selected on a new rental order or quote.
Screenshot: Customer Detail View (1)

Image file: `screenshots/p46_01_customer_detail_view_1.png`



---

## Page 47

Aiven Rental App User Manual
Page 47
Screenshot: Customer Detail View (2)

Image file: `screenshots/p47_01_customer_detail_view_2.png`


Customer Detail - Extra Drawers
Purpose: Use customer drawers for documents, verification, and other extra customer information.
How to use it
1
Open the customer detail page.
2
Open the Documents or Verification drawer.
3
Upload or review customer documents.
4
Review verification information in the Verification drawer.
5
Use the Customer edits button to review submitted customer changes.
6
Close the drawer and return to the customer profile.
Mandatory information / rules
G
Documents and Verification drawers are optional app sections.
Optional but useful information
G
Use drawers for insurance, business licenses, credit forms, contracts, or customer-submitted updates.
Important notes
G
Keep sensitive documents organized and avoid storing unrelated files on the customer profile.

---

## Page 48

Aiven Rental App User Manual
Page 48
Screenshot: Customer Detail - Extra Drawers

Image file: `screenshots/p48_01_customer_detail_extra_drawers.png`


Detailed Workflow: Create a New Customer
1
Open Customers from the side navigation.
2
Click New Customer.
3
Choose Standalone and enter Company name, or choose Branch and enter Parent customer plus Branch name.
4
Add street address, city, province/state, country, and postal code.
5
Add contacts. For each contact, include name, role/title, email, and phone where possible.
6
Set Charge Deposit, special pricing, follow up date, sales person, and general notes as needed.
7
Save the customer.
8
Return to Rental Orders or Quotes and select the customer on the new record.
Detailed Workflow: Send a Customer Link
1
Open the customer, quote, or rental order record.
2
Make sure the record is saved and the customer-facing information is accurate.
3
Open the customer update/link section.
4
Click Generate link or Generate customer link.
5
Copy the generated Share link field. On pages that show a Copy button, use Copy.
6
Paste the link into an email, text, or message to the customer.
7
After the customer submits changes, return to the app and review customer edits before treating them as final.

---

## Page 49

Aiven Rental App User Manual
Page 49
11. Sales People
Sales People Table View
Purpose: Maintain the list of sales staff available for quotes, rental orders, and reporting.
How to use it
1
Open Sales People from the side navigation.
2
Review the table of existing salespeople.
3
Use the Sales People list to find the salesperson.
4
Click a row to open the salesperson detail page.
5
Click Add Sales Person to create a new record.
Mandatory information / rules
G
No fields are required to view the table.
Optional but useful information
G
The Sales People detail page stores salesperson name, email, phone, and photo, and shows a monthly charges vs QBO
invoices chart for the selected date range.
Important notes
G
Assigning a salesperson to quotes and orders helps with accountability, follow-up, and commission/reporting workflows.
Screenshot: Sales People Table View

Image file: `screenshots/p49_01_sales_people_table_view.png`


Sales People Detail View
Purpose: Create or edit salesperson records.
How to use it
1
Open Sales People and click Add Sales Person, or open an existing record.
2
Enter the salesperson's name.
3
Add email, phone, and photo.
4
Save the salesperson.
5
Use this salesperson on quotes or rental orders.
Mandatory information / rules
G
Salesperson name is required.

---

## Page 50

Aiven Rental App User Manual
Page 50
Optional but useful information
G
Email, phone, and photo are optional.
Important notes
G
Use a consistent naming format so the same salesperson does not appear twice in reports.
Screenshot: Sales People Detail View

Image file: `screenshots/p50_01_sales_people_detail_view.png`



---

## Page 51

Aiven Rental App User Manual
Page 51
12. Operational Best Practices
G
Create customers before building rental orders so customer addresses, contacts, terms, and pricing can flow into the order.
G
Use booked dates for scheduling, quoting, and availability. Use actual dates only when the field event has happened.
G
Assign real assets/units before an order is picked, delivered, or closed so inventory availability remains accurate.
G
Keep site addresses and asset current locations clean. This improves map views, dispatch decisions, and asset tracking.
G
Use Base location for where a unit normally belongs, and Current location for where it physically is now. Do not create
temporary customer/jobsite pins as base locations unless they should remain selectable as normal operating locations.
G
Use before/after documents for equipment condition evidence, not just general attachments.
G
Link work orders to rental orders when service is connected to a customer job.
G
Use monthly charges to audit recurring revenue, but correct errors at the order/line-item level.
G
Avoid duplicate customers, vendors, salespeople, equipment types, and parts by searching before creating new records.
G
Use history pages when a user needs to understand who changed a record and when.
Common Mistakes to Avoid
G
Using actual dates as guesses. Actual dates should represent completed events.
G
Creating assets without a consistent serial number format.
G
Adding fees as equipment line items when they should be additional fees.
G
Sending a customer link before reviewing what the customer can see.
G
Leaving site addresses blank on orders that require delivery, pickup, or return.
G
Assuming an actual return automatically moves assets back to base. The return popup asks whether to set current location
to base or do nothing; choose the base option when the unit really returned home.
G
Closing an order before all returns, charges, documents, and work orders have been reviewed.

---



# Enhanced Screenshot Guidance

Use this section to choose the most relevant screenshot when a page has multiple images.

Important example: for **adding a line item on a rental order**, use **`screenshots/p14_01_rental_order_quote_detail_page_2.png`** because it is the second/middle screenshot and is the best match for the line items section.

- **screenshots/p04_01_landing_page.png** - Landing Page

- **screenshots/p05_01_login.png** - Login

- **screenshots/p06_01_work_bench_timeline_view.png** - Work Bench - Timeline View

- **screenshots/p07_01_work_bench_stages_view.png** - Work Bench - Stages View

- **screenshots/p08_01_work_bench_pick_return_view.png** - Work Bench - Pick/Return View

- **screenshots/p09_01_dashboard_map_view.png** - Dashboard - Map View

- **screenshots/p10_01_dashboard_availability_and_utilization_view.png** - Dashboard - Availability and Utilization View

- **screenshots/p11_01_quotes_table.png** - Quotes Table - list view of quotes with search/filter controls and New Quote action.

- **screenshots/p12_01_rental_order_table.png** - Rental Order Table - list view of rental orders. Best for finding an order or starting a new rental order using the New RO button.

- **screenshots/p13_01_rental_order_quote_detail_page_1.png** - Rental Order / Quote Detail Page (1) - first/top screenshot of the rental order detail page. Best for header-level fields such as customer selection, RO/quote header fields, status, terms, and top navigation.

- **screenshots/p14_01_rental_order_quote_detail_page_2.png** - Rental Order / Quote Detail Page (2) - second/middle screenshot of the rental order detail page. Best for line items and mid-page order-entry actions. Use this screenshot when the user asks about adding or editing line items.

- **screenshots/p14_02_rental_order_quote_detail_page_3.png** - Rental Order / Quote Detail Page (3) - third/lower screenshot of the rental order detail page. Best for lower-page sections such as documents, history, recurring/monthly charges, and other bottom-page details.

- **screenshots/p16_01_rental_order_quote_pick_site_address_popup.png** - Rental Order / Quote - Pick Site Address Popup

- **screenshots/p17_01_rental_order_quote_additional_fee_popup.png** - Rental Order / Quote - Additional Fee Popup

- **screenshots/p18_01_rental_order_quote_before_after_documents_popup.png** - Rental Order / Quote - Before/After Documents Popup

- **screenshots/p19_01_rental_order_quote_booked_dates_popup.png** - Rental Order / Quote - Booked Dates Popup

- **screenshots/p20_01_rental_order_actual_dates_popup_1.png** - Rental Order - Actual Dates Popup (1) - first screenshot of this multi-screen workflow, likely showing the top / header section.

- **screenshots/p20_02_rental_order_actual_dates_popup_2.png** - Rental Order - Actual Dates Popup (2) - second screenshot of this multi-screen workflow, likely showing the middle section.

- **screenshots/p21_01_rental_order_add_pause_period.png** - Rental Order - Add Pause Period

- **screenshots/p22_01_rental_order_quote_attachments_drawer.png** - Rental Order / Quote - Attachments Drawer

- **screenshots/p23_01_rental_order_quote_history_page.png** - Rental Order / Quote - History Page

- **screenshots/p24_01_rental_order_quote_monthly_charges.png** - Rental Order / Quote - Monthly Charges

- **screenshots/p25_01_rental_order_quote_customer_update_page.png** - Rental Order / Quote - Customer Update Page

- **screenshots/p26_01_customer_link_page_for_rental_order_quote_1.png** - Customer Link Page for Rental Order / Quote (1) - first/top screenshot of the external customer-facing order page.

- **screenshots/p26_02_customer_link_page_for_rental_order_quote_2.png** - Customer Link Page for Rental Order / Quote (2) - second/lower screenshot of the external customer-facing order page.

- **screenshots/p27_01_monthly_charges_page.png** - Monthly Charges Page - summary view of recurring monthly charges across customers/orders.

- **screenshots/p28_01_work_orders_table_view.png** - Work Orders Table View - work orders list with New Work Order action.

- **screenshots/p29_01_work_order_detail_view_1.png** - Work Order Detail View (1) - first/top screenshot of the work order detail page, useful for work order header details and asset selection.

- **screenshots/p29_02_work_order_detail_view_2.png** - Work Order Detail View (2) - second/middle screenshot of the work order detail page, typically useful for work summary, instructions, dates, and parts/labor sections.

- **screenshots/p30_01_work_order_detail_view_3.png** - Work Order Detail View (3) - third/lower screenshot of the work order detail page, useful for lower-page or additional sections.

- **screenshots/p31_01_parts.png** - Parts - parts inventory list/detail area used to add or manage parts.

- **screenshots/p32_01_assets_table_view.png** - Assets Table View - list of assets with filters and Add Equipment/Asset button.

- **screenshots/p33_01_asset_detail_view.png** - Asset Detail View - main asset/unit detail page for editing type, model, serial number, location, and other asset fields.

- **screenshots/p34_01_asset_detail_current_location_map_popup.png** - Asset Detail - Current Location Map Popup

- **screenshots/p35_01_asset_detail_bundle_popup.png** - Asset Detail - Bundle Popup

- **screenshots/p36_01_equipment_page_table_view.png** - Equipment Page Table View

- **screenshots/p37_01_equipment_detail_page.png** - Equipment Detail Page - equipment type/model form used for creating or editing an equipment type.

- **screenshots/p38_01_location_table_view.png** - Location Table View

- **screenshots/p38_02_location_detail_view_1.png** - Location Detail View (1) - first/top screenshot of the location detail page.

- **screenshots/p39_01_location_detail_view_2.png** - Location Detail View (2) - second/lower screenshot of the location detail page.

- **screenshots/p40_01_purchase_order_table_view.png** - Purchase Order Table View

- **screenshots/p41_01_purchase_order_detail_view.png** - Purchase Order Detail View

- **screenshots/p42_01_sales_order_detail_view.png** - Sales Order Detail View

- **screenshots/p43_01_vendor_detail_view.png** - Vendor Detail View

- **screenshots/p44_01_customer_table_view.png** - Customer Table View - customers list with New Customer action.

- **screenshots/p45_01_customer_quickbooks_online_sync.png** - Customer QuickBooks Online Sync - customer sync page or panel showing QuickBooks integration controls/status.

- **screenshots/p46_01_customer_detail_view_1.png** - Customer Detail View (1) - first/top screenshot of the customer detail page.

- **screenshots/p47_01_customer_detail_view_2.png** - Customer Detail View (2) - second/lower screenshot of the customer detail page.

- **screenshots/p48_01_customer_detail_extra_drawers.png** - Customer Detail - Extra Drawers

- **screenshots/p49_01_sales_people_table_view.png** - Sales People Table View

- **screenshots/p50_01_sales_people_detail_view.png** - Sales People Detail View
