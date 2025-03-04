import React, { useState, useEffect } from 'react';
import neo4j from 'neo4j-driver';

// Neo4j connection credentials
const URI = 'bolt://localhost:7687';
const USER = 'neo4j';
const PASSWORD = 'PASSWORD';

const Neo4jData = () => {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Create Neo4j driver instance
    const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

    const fetchData = async () => {
      const session = driver.session();
      try {
        // Run Cypher query to get paired to_name and from_name
        const result = await session.run('MATCH (n) RETURN n.to_name AS to_name, n.from_name AS from_name, lat1 AS lat_to, long1 AS long_to, lat2 AS lat_from, long2 AS long_from');
        
        const pairedNames = result.records.map(record => ({
          to_name: record.get('to_name'),
          from_name: record.get('from_name')
        }));
      
        setData(pairedNames);
      } catch (err) {
        console.error('Error executing Neo4j query:', err);
        setError('Failed to fetch data from Neo4j.');
      } finally {
        // Close session
        await session.close();
      }
    };

    fetchData();
    
  }, []); // Empty dependency array ensures this runs only once

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h2>Neo4j Data</h2>
      <ul>
        {data.length > 0 ? (
          data.map((item, index) => (
            <li key={index}>To: {item.to_name || 'N/A'}, From: {item.from_name || 'N/A'}</li>
          ))
        ) : (
          <li>No data found</li>
        )}
      </ul>
    </div>
  );
};

export default Neo4jData;
