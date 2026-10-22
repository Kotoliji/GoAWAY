#!/bin/bash
# Runs once, on the first start of the Oracle container (empty volume).
# The gvenzl image has already created the TVDEPT user (APP_USER) in XEPDB1.
echo "TVDEPT: building schema, data, views and PL/SQL..."
# SQL*Plus resolves the @@ paths in install.sql from the working dir, so cd
# first (in a subshell: this file is sourced by the image's entrypoint).
(cd /opt/tvdept && echo "exit" | sqlplus -s tvdept/tvdept@//localhost/XEPDB1 @install.sql)
# Marker for the compose healthcheck; lives in the data volume, so it survives restarts.
touch /opt/oracle/oradata/.tvdept_installed
echo "TVDEPT: install finished."
