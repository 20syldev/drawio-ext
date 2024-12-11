/**
 * Graph generation for switches using YaNa API
 */
Draw.loadPlugin(function (ui) {
  const graph = ui.editor.graph;
  const toolbar = ui.toolbar;
  let movedElements = new Set();
  let currentEntity = null;

  toolbar.addMenuFunction("Load", "Load initial graph", true, () => selectEntity(loadInitialGraph), toolbar.container);
  toolbar.addMenuFunction("Re-update", "Update graph", true, reUpdateGraph, toolbar.container);
  toolbar.addMenuFunction("Reset", "Reset graph", true, resetGraph, toolbar.container);

  // Gestion des déplacements manuels
  graph.addListener(mxEvent.CELLS_MOVED, (sender, evt) => {
      const cells = evt.getProperty('cells');
      cells.forEach(cell => {
          if (cell.vertex) movedElements.add(cell.id);
      });
  });

  function selectEntity(callback) {
      fetch('http://na2-api.zenetys.loc/entities')
          .then(res => res.json())
          .then(entities => {
              const popup = new mxWindow("Select Entity", document.createElement('div'), 300, 300, 200, 100, true, true);
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
              const switchMap = createOrUpdateDevices(graph, parent, devices);
              createOrUpdateLinks(graph, parent, switchMap, links);
          } finally {
              graph.getModel().endUpdate();
          }
          applyOrganicLayout(graph);
      }).catch(error => console.error('Error loading initial graph:', error));
  }

  function reUpdateGraph() {
      fetchGraphData().then(({ devices, links }) => {
          const parent = graph.getDefaultParent();
          graph.getModel().beginUpdate();
          try {
              blockMovedElements(graph);
              const switchMap = createOrUpdateDevices(graph, parent, devices);
              createOrUpdateLinks(graph, parent, switchMap, links);
              applyOrganicLayout(graph);
          } finally {
              graph.getModel().endUpdate();
          }
          resetMovable(graph);
      }).catch(console.error);
  }

  function resetGraph() {
      movedElements.clear();
      graph.getModel().beginUpdate();
      try {
          graph.getModel().clear();
          loadInitialGraph();
      } finally {
          graph.getModel().endUpdate();
      }
  }

  function createOrUpdateDevices(graph, parent, devices) {
      const switchMap = {};
      devices.forEach(device => {
          let switchVertex = graph.getModel().getCell(device.id);
  
          if (switchVertex) {
              if (!movedElements.has(device.id)) {
                  switchVertex.value = `${device.name}\n${device.ip[0]}`;
              }
              const currentStyle = graph.getCellStyle(switchVertex);
              const styleString = typeof currentStyle === 'string' ? currentStyle : currentStyle['style'] || '';
              const updatedStyle = styleString.includes('movable=0;') 
                  ? styleString.replace('movable=0;', 'movable=1;')
                  : styleString + 'movable=1;';
              graph.getModel().setStyle(switchVertex, updatedStyle);
          } else {
              const style = movedElements.has(device.id) ? 'movable=0;' : 'movable=1;';
              switchVertex = graph.insertVertex(
                  parent,
                  device.id,
                  `${device.name}\n${device.ip[0]}`,
                  0,
                  0,
                  120,
                  40,
                  style
              );
          }
          switchMap[device.id] = switchVertex;
      });
      return switchMap;
  }

  function createOrUpdateLinks(graph, parent, switchMap, links) {
      const processedLinks = new Set();
      const existingEdges = graph.getModel().getCells().filter(cell => graph.getModel().isEdge(cell));
      existingEdges.forEach(edge => {
          graph.removeCells([edge]);
      });

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

  function getLinkStyle(speed, duplex) {
      return duplex === 2 || speed <= 100_000_000
          ? 'html=1;rounded=0;fontSize=0;labelBackgroundColor=default;strokeColor=red;endArrow=none;'
          : 'html=1;rounded=0;fontSize=0;labelBackgroundColor=default;strokeColor=black;endArrow=none;';
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
      const lockedCells = new Set();
      graph.getModel().filterDescendants(cell => {
          if (cell.vertex && graph.getCellStyle(cell)['movable'] === '0') {
              lockedCells.add(cell.id);
          }
      });
      graph.getModel().beginUpdate();
      try {
          layout.execute(parent);
          lockedCells.forEach(cellId => {
              const cell = graph.getModel().getCell(cellId);
              if (cell) graph.getModel().setStyle(cell, 'movable=0;');
          });
      } finally {
          graph.getModel().endUpdate();
      }
  }

  function blockMovedElements(graph) {
      movedElements.forEach(id => {
          const cell = graph.getModel().getCell(id);
          if (cell) graph.getModel().setStyle(cell, 'movable=0;');
      });
  }

  function resetMovable(graph) {
      graph.getModel().beginUpdate();
      try {
          graph.getModel().filterDescendants(cell => {
              if (cell.vertex && !movedElements.has(cell.id)) {
                  const currentStyle = graph.getCellStyle(cell);
                  const styleString = typeof currentStyle === 'string' ? currentStyle : currentStyle['style'] || '';
                  let updatedStyle = styleString.includes('movable=0;') 
                      ? styleString.replace('movable=0;', 'movable=1;')
                      : styleString + 'movable=1;';

                  if (!updatedStyle.includes('fontSize=8;')) updatedStyle += 'edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=8;labelBackgroundColor=default;';
  
                  graph.getModel().setStyle(cell, updatedStyle);
              }
          });
      } finally {
          graph.getModel().endUpdate();
      }
  }
});
