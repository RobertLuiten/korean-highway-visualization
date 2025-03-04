import React, { useState, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 0,
  zoom: 2,
  pitch: 0,
  bearing: 0
};

function FRANKENSTEIN() {
  const [nodeData, setNodeData] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch('/FRANKENSTEIN/FRANKENSTEIN.edges'),
      fetch('/FRANKENSTEIN/FRANKENSTEIN.graph_labels')
    ])
      .then(([edgesResponse, labelsResponse]) => 
        Promise.all([edgesResponse.text(), labelsResponse.text()])
      )
      .then(([edgesText, labelsText]) => {
        const edges = edgesText.trim().split('\n');
        const labels = labelsText.trim().split('\n');
        const nodes = new Map();
  
        // Process edges and create nodes
        edges.forEach(edge => {
          const [source, target] = edge.split(',').map(Number);
          if (!nodes.has(source)) {
            nodes.set(source, { connections: new Set() });
          }
          if (!nodes.has(target)) {
            nodes.set(target, { connections: new Set() });
          }
          nodes.get(source).connections.add(target);
        });
  
        // Assign positions and colors to nodes (so I think no repeats?!)
        const nodeArray = Array.from(nodes.entries()).map(([nodeId, nodeData], index) => {
          const gridSize = Math.ceil(Math.sqrt(nodes.size));
          const x = index % gridSize;
          const y = Math.floor(index / gridSize);
          return {
            id: nodeId,
            position: [x * 0.1, y * 0.1], // Grid layout positioning (fancy!) (I credit this line to my good friend Perplexity!)
            color: labels[index] === '-1' ? [255, 0, 0] : [0, 255, 0],
            radius: 100,
            connections: Array.from(nodeData.connections)
          };
        });
  
        console.log('Processed Nodes:', nodeArray);
        setNodeData(nodeArray);
      })
      .catch(error => console.error('Error fetching data:', error));
  }, []);
  
  

  const layers = [
    new LineLayer({
      id: 'line-layer',
      data: nodeData.flatMap(node => 
        node.connections.map(targetId => ({
          source: node.position,
          target: nodeData.find(n => n.id === targetId).position
        }))
      ),
      getSourcePosition: d => d.source,
      getTargetPosition: d => d.target,
      getColor: [200, 200, 200],
      getWidth: 1
    }),
    new ScatterplotLayer({
      id: 'scatterplot-layer',
      data: nodeData,
      pickable: true,
      opacity: 1.0,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 1,
      radiusMaxPixels: 100,
      lineWidthMinPixels: 1,
      getPosition: d => d.position,
      getRadius: d => d.radius,
      getFillColor: d => d.color,
      getLineColor: d => [0, 0, 0]
    })
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <h1>Robert's Confusing Graph Surprise!</h1>
      <h2>Maybe there is a way to incorporate coordinates better into these types of datasets, but without geographical data,
        DeckGL may not be the best option for analysing non-geographical network data.
      </h2>
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
    >
    </DeckGL>
    </div>
  );
}

export default FRANKENSTEIN;
