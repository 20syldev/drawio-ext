/*
 * Graph generation for switches using YaNa API
*/
Draw.loadPlugin(function (ui) {
    const graph = ui.editor.graph;
    const toolbar = ui.toolbar;
    let currentEntity = null;

    toolbar.addMenuFunction("Load", "Load initial graph", true, () => selectEntity(loadInitialGraph), toolbar.container);
    toolbar.addMenuFunction("Re-update", "Update graph", true, reUpdateGraph, toolbar.container);
    toolbar.addMenuFunction("Reset", "Reset graph", true, resetGraph, toolbar.container);

    function selectEntity(callback) {
        fetch('http://na2-api.zenetys.loc/entities')
            .then(res => res.json())
            .then(entities => {
                const popup = new mxWindow("Select Entity", document.createElement('div'), 300, 300, 250, 80, true, true);
                const select = document.createElement('select');
                entities.forEach(entity => {
                    const option = document.createElement('option');
                    option.value = entity;
                    option.textContent = entity;
                    select.appendChild(option);
                });
                const validateBtn = document.createElement('button');
                validateBtn.textContent = "Validate";
                validateBtn.onclick = () => {
                    currentEntity = select.value;
                    popup.destroy();
                    callback();
                };
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = "Cancel";
                cancelBtn.onclick = () => popup.destroy();
                const content = popup.content;
                content.appendChild(select);
                content.appendChild(validateBtn);
                content.appendChild(cancelBtn);
                popup.setVisible(true);
            })
            .catch(err => console.error("Error fetching entities:", err));
    }

    async function fetchGraphData() {
        const apiDevices = `http://na2-api.zenetys.loc/entity/${currentEntity}/devices?q=switch`;
        const apiLinks = `http://na2-api.zenetys.loc/entity/${currentEntity}/dump?table=snei`;

        try {
            const formattedLinks = [];
            const [devices, links] = await Promise.all([
                fetch(apiDevices).then(res => res.json()),
                fetch(apiLinks).then(res => res.json())
            ]);
            const switches = devices.reduce((acc, device) => {
                acc[device.id] = device.iface;
                return acc;
            }, {});

            Object.entries(links).forEach(([switchId, ports]) => {
                Object.entries(ports).forEach(([port, portLinks]) => {
                    portLinks.forEach(link => {
                        if (link.id !== switchId) {
                            const targetIface = switches[link.id] ? switches[link.id][link.ifname] : null;
                            const speed = targetIface ? targetIface.speed || 0 : 0;
                            const duplex = targetIface ? targetIface.duplex || 0 : 0;

                            formattedLinks.push({
                                sourceId: switchId,
                                targetId: link.id,
                                sourcePort: port,
                                targetPort: link.ifname,
                                speed: speed,
                                duplex: duplex
                            });
                        }
                    });
                });
            });
            return { devices, links: formattedLinks };
        } catch (error) {
            console.error(error);
            return { devices: [], links: [] };
        }
    }

    function loadInitialGraph() {
        if (!currentEntity) return alert("No entity selected!");
        fetchGraphData().then(({ devices, links }) => {
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
                const switchMap = createDevices(graph, parent, devices);
                updateDevices(graph, switchMap, devices);
                createLinks(graph, parent, switchMap, links);

                const entityObject = document.createElement('object');
                entityObject.setAttribute('label', '');
                entityObject.setAttribute('yana-entity', currentEntity);
                entityObject.setAttribute('id', '0');

                const entityCell = new mxCell();
                entityCell.setValue(entityObject);
                graph.getModel().add(entityCell);
            } finally {
                applyOrganicLayout(graph);
                graph.getModel().endUpdate();
            }
        }).catch(error => console.error('Error loading initial graph:', error));
    }

    function reUpdateGraph() {
        if (!currentEntity) return alert("No entity selected!");
        fetchGraphData().then(({ devices, links }) => {
            const parent = graph.getDefaultParent();
            graph.getModel().beginUpdate();
            try {
                const switchMap = createDevices(graph, parent, devices);
                updateDevices(graph, switchMap, devices);
                updateLinks(graph, parent, switchMap, links);

                let entityCell = graph.getModel().getCell('0');
                if (!entityCell) {
                    const entityObject = document.createElement('object');
                    entityObject.setAttribute('label', '');
                    entityObject.setAttribute('yana-entity', currentEntity);
                    entityObject.setAttribute('id', '0');
                    const entityCell = new mxCell();
                    entityCell.setValue(entityObject);
                    graph.getModel().add(entityCell);
                }
            } finally {
                graph.getModel().endUpdate();
            }
            applyOrganicLayout(graph);
        }).catch(console.error);
    }

    function resetGraph() {
        currentEntity = null;
        graph.getModel().beginUpdate();
        try { graph.getModel().clear(); }
        finally { graph.getModel().endUpdate(); }
    }

    function createDevices(graph, parent, devices) {
        const switchMap = {};
        devices.forEach(device => {
            if (!graph.getModel().getCell(device.id)) {
                const textContent = `${device.name}\n${device.ip[0]}`;
                const textWidth = getTextWidth(textContent);
                const width = Math.max(100, textWidth);
                const switchVertex = graph.insertVertex(
                    parent,
                    device.id,
                    textContent,
                    0,
                    0,
                    width,
                    40
                );
                switchMap[device.id] = switchVertex;
            }
        });
        return switchMap;
    }

    function updateDevices(graph, switchMap, devices) {
        devices.forEach(device => {
            const switchVertex = graph.getModel().getCell(device.id);
            if (switchVertex) {
                switchVertex.value = `${device.name}\n${device.ip[0]}`;
                if (!switchVertex.geometry) switchVertex.setGeometry(new mxGeometry(0, 0, 100, 40));
            }
            switchMap[device.id] = switchVertex;
        });
    }

    function createLinks(graph, parent, switchMap, links) {
        const processedLinks = new Set();
        links.forEach(link => {
            const linkKey = `${link.sourceId}-${link.targetId}`;
            const reverseLinkKey = `${link.targetId}-${link.sourceId}`;
            if (!processedLinks.has(linkKey) && !processedLinks.has(reverseLinkKey)) {
                const sourceSwitch = switchMap[link.sourceId];
                const targetSwitch = switchMap[link.targetId];
                if (sourceSwitch && targetSwitch) {
                    const edge = graph.insertEdge(
                        parent,
                        null,
                        null,
                        sourceSwitch,
                        targetSwitch,
                        getLinkStyle(link.speed, link.duplex)
                    );
                    addPortLabels(graph, edge, link.sourcePort, link.targetPort, linkKey);
                    processedLinks.add(linkKey);
                }
            }
        });
    }

    function updateLinks(graph, parent, switchMap, links) {
        const existingEdges = graph.getModel().getCells().filter(cell => graph.getModel().isEdge(cell));
        existingEdges.forEach(edge => graph.removeCells([edge]));
        createLinks(graph, parent, switchMap, links);
    }

    function getLinkStyle(speed, duplex) {
        return duplex === 2 || speed <= 1000000000
            ? 'html=1;rounded=0;fontSize=0;labelBackgroundColor=default;strokeColor=red;endArrow=none;'
            : 'html=1;rounded=0;fontSize=0;labelBackgroundColor=default;strokeColor=black;endArrow=none;';
    }

    function getTextWidth(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const width = context.measureText(text).width;
        return width;
    }

    function addPortLabels(graph, edge, sourcePort, targetPort, linkKey) {
        const existingSourceLabel = graph.getModel().getCell(`${linkKey}-source`);
        const existingTargetLabel = graph.getModel().getCell(`${linkKey}-target`);

        if (!existingSourceLabel) {
            const sourceLabel = new mxCell(
                sourcePort,
                new mxGeometry(-0.5, -0.5, 0, 0),
                'edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=8;labelBackgroundColor=default;'
            );
            sourceLabel.vertex = true;
            sourceLabel.geometry.relative = true;
            sourceLabel.id = `${linkKey}-source`;
            graph.addCell(sourceLabel, edge);
        }

        if (!existingTargetLabel) {
            const targetLabel = new mxCell(
                targetPort,
                new mxGeometry(0.5, 0.5, 0, 0),
                'edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=8;labelBackgroundColor=default;'
            );
            targetLabel.vertex = true;
            targetLabel.geometry.relative = true;
            targetLabel.id = `${linkKey}-target`;
            graph.addCell(targetLabel, edge);
        }
    }

    function applyOrganicLayout(graph) {
        const layout = new mxFastOrganicLayout(graph);
        layout.forceConstant = 200;
        layout.minDistanceLimit = 200;
        const parent = graph.getDefaultParent();
        graph.getModel().beginUpdate();
        try {
            layout.execute(parent);
        } finally {
            graph.getModel().endUpdate();
        }
    }
});
