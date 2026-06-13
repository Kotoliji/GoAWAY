#!/usr/bin/env python3
"""
Generate ER diagram for draw.io — TVDEPT v3
Reflects current schema (CP2): fuel_type + vehicle_type AI/NOAI,
TRIP_REQUEST -> VEHICLE relationship, DRIVER_VEHICLE 1:N
"""

cells = []
cell_id = 1

def nid():
    global cell_id
    cell_id += 1
    return str(cell_id)

def add_entity(name, x, y, w=130, h=60):
    eid = nid()
    cells.append(
        f'<mxCell id="{eid}" value="{name}" '
        f'style="rounded=0;whiteSpace=wrap;html=1;labelBackgroundColor=none;" '
        f'vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/>'
        f'</mxCell>'
    )
    return eid

def add_diamond(name, x, y, w=100, h=70):
    did = nid()
    cells.append(
        f'<mxCell id="{did}" value="{name}" '
        f'style="rhombus;whiteSpace=wrap;html=1;labelBackgroundColor=none;" '
        f'vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/>'
        f'</mxCell>'
    )
    return did

def add_edge(src_id, tgt_id, card="", src_arrow=True):
    eid = nid()
    arrow_style = (
        "startArrow=classic;startFill=1;endArrow=none;endFill=0;"
        if src_arrow else "endArrow=none;endFill=0;"
    )
    cells.append(
        f'<mxCell id="{eid}" value="" '
        f'style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;'
        f'{arrow_style}labelBackgroundColor=none;fontColor=default;" '
        f'edge="1" parent="1" source="{src_id}" target="{tgt_id}">'
        f'<mxGeometry relative="1" as="geometry"/>'
        f'</mxCell>'
    )
    if card:
        lid = nid()
        cells.append(
            f'<mxCell id="{lid}" value="{card}" '
            f'style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" '
            f'connectable="0" vertex="1" parent="{eid}">'
            f'<mxGeometry relative="1" x="0.7" as="geometry"><mxPoint as="offset"/></mxGeometry>'
            f'</mxCell>'
        )
    return eid

# ==========================================
# ENTITIES (13 tables as entities; DRIVER_VEHICLE is a relationship)
# ==========================================

# Top row
client_rating = add_entity("CLIENT_RATING", 260, -40)
trip_process  = add_entity("TRIP_PROCESS", 900, -40)
trip_prefs    = add_entity("TRIP_PREFERENCES", 1320, 120, 160)

# Middle row
tariff        = add_entity("TARIFF", 20, 180)
trip          = add_entity("TRIP", 280, 360)
trip_request  = add_entity("TRIP_REQUEST", 900, 360, 150)
client        = add_entity("CLIENT", 1320, 360)

# Third row
driver_rating = add_entity("DRIVER_RATING", -260, 360)
driver        = add_entity("DRIVER", 900, 680)
driver_pay    = add_entity("DRIVER_PAYMENT", 1320, 560, 160)

# Bottom row
location      = add_entity("LOCATION", -260, 820)
vehicle       = add_entity("VEHICLE", 20, 680)
driver_sched  = add_entity("DRIVER_SCHEDULE", 620, 820, 160)

# ==========================================
# DIAMONDS (relationships)
# ==========================================

d_requests    = add_diamond("requests", 1150, 360)
d_becomes     = add_diamond("becomes", 620, 360)
d_performs    = add_diamond("performs", 280, 520)
d_assigned    = add_diamond("assigned", 900, 520)
d_client_rate = add_diamond("client_rates", 280, 160)
d_driver_rate = add_diamond("driver_rates", -100, 360)
d_used_in     = add_diamond("used_in", 20, 520)
d_drives      = add_diamond("drives", 460, 680)
d_tracked     = add_diamond("tracked", -130, 820)
d_logs        = add_diamond("logs", 900, 160)
d_receives    = add_diamond("receives", 1150, 620)
d_schedule    = add_diamond("schedule", 820, 820)
d_preferences = add_diamond("preferences", 1180, 180)
d_proc_drv    = add_diamond("process_driver", 1140, -40)
# NEW: TRIP_REQUEST <-> VEHICLE (assigned vehicle, from vehicle_id FK)
d_req_vehicle = add_diamond("for_vehicle", 500, 180)
# Missing FK relationships added so the ER matches tables.sql exactly:
d_rated_by    = add_diamond("rated_by", 790, 40)     # CLIENT_RATING -> CLIENT
d_rating_of   = add_diamond("rating_of", 300, 430)   # DRIVER_RATING -> DRIVER
d_sched_veh   = add_diamond("on_vehicle", 340, 860)  # DRIVER_SCHEDULE -> VEHICLE

# ==========================================
# EDGES
# ==========================================

# CLIENT --requests--> TRIP_REQUEST (1:N)
add_edge(client, d_requests)
add_edge(d_requests, trip_request, "1:N")

# TRIP_REQUEST --becomes--> TRIP (1:1)
add_edge(trip_request, d_becomes)
add_edge(d_becomes, trip, "1:1")

# TRIP --performs--> DRIVER (1:N: many trips -> 1 driver)
add_edge(trip, d_performs)
add_edge(d_performs, driver, "N:1")

# TRIP_REQUEST --assigned--> DRIVER (N:1)
add_edge(trip_request, d_assigned)
add_edge(d_assigned, driver, "N:1")

# TRIP --client_rates--> CLIENT_RATING (1:1)
add_edge(trip, d_client_rate)
add_edge(d_client_rate, client_rating, "1:1")

# TRIP --driver_rates--> DRIVER_RATING (1:1)
add_edge(trip, d_driver_rate)
add_edge(d_driver_rate, driver_rating, "1:1")

# TRIP --used_in--> VEHICLE (N:1)
add_edge(trip, d_used_in)
add_edge(d_used_in, vehicle, "N:1")

# DRIVER --drives--> VEHICLE (1:N - one driver can drive many vehicles,
# but one vehicle belongs to one driver due to UNIQUE on vehicle_id)
add_edge(driver, d_drives)
add_edge(d_drives, vehicle, "1:N")

# VEHICLE --tracked--> LOCATION (1:N)
add_edge(vehicle, d_tracked)
add_edge(d_tracked, location, "1:N")

# TRIP_REQUEST --logs--> TRIP_PROCESS (1:N)
add_edge(trip_request, d_logs)
add_edge(d_logs, trip_process, "1:N")

# DRIVER --receives--> DRIVER_PAYMENT (1:N)
add_edge(driver, d_receives)
add_edge(d_receives, driver_pay, "1:N")

# DRIVER --schedule--> DRIVER_SCHEDULE (1:N)
add_edge(driver, d_schedule)
add_edge(d_schedule, driver_sched, "1:N")

# TRIP_REQUEST --preferences--> TRIP_PREFERENCES (1:1)
add_edge(trip_request, d_preferences)
add_edge(d_preferences, trip_prefs, "1:1")

# TRIP_PROCESS --process_driver--> DRIVER (N:1)
add_edge(trip_process, d_proc_drv)
add_edge(d_proc_drv, driver, "N:1")

# NEW: TRIP_REQUEST --for_vehicle--> VEHICLE (N:1)
add_edge(trip_request, d_req_vehicle)
add_edge(d_req_vehicle, vehicle, "N:1")

# CLIENT_RATING --rated_by--> CLIENT (N:1) - the client who gave the rating
add_edge(client_rating, d_rated_by)
add_edge(d_rated_by, client, "N:1")

# DRIVER_RATING --rating_of--> DRIVER (N:1) - the driver being rated
add_edge(driver_rating, d_rating_of)
add_edge(d_rating_of, driver, "N:1")

# DRIVER_SCHEDULE --on_vehicle--> VEHICLE (N:1) - the vehicle of the shift
add_edge(driver_sched, d_sched_veh)
add_edge(d_sched_veh, vehicle, "N:1")

# ==========================================
# BUILD XML
# ==========================================

xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
xml += '<mxfile host="app.diagrams.net" version="29.6.6">\n'
xml += '  <diagram name="ER Diagram - TVDEPT v3" id="er_v3">\n'
xml += '    <mxGraphModel dx="2500" dy="2000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">\n'
xml += '      <root>\n'
xml += '        <mxCell id="0"/>\n'
xml += '        <mxCell id="1" parent="0"/>\n'
for c in cells:
    xml += f'        {c}\n'
xml += '      </root>\n'
xml += '    </mxGraphModel>\n'
xml += '  </diagram>\n'
xml += '</mxfile>\n'

output = 'c:/Users/kiril/Desktop/Data/test/_ER_TVDEPT_v3.drawio'
with open(output, 'w', encoding='utf-8') as f:
    f.write(xml)

print(f'ER diagram v3 generated: {output}')
print(f'Total cells: {cell_id}')
print('Open in draw.io: https://app.diagrams.net/ -> File -> Open')
