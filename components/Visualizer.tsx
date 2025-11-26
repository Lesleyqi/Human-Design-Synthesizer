import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  className?: string;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, className }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!analyser || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Setup Analyser
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // D3 Scales
    const xScale = d3.scaleBand()
      .range([0, width])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, 255])
      .range([height, 0]);

    // Color Scale
    const colorScale = d3.scaleSequential()
      .domain([0, bufferLength])
      .interpolator(d3.interpolateCool); // Cyberpunk colors

    xScale.domain(d3.range(bufferLength).map(String));

    // Create Bars
    svg.selectAll('*').remove(); // Clear previous
    const bars = svg.selectAll('rect')
      .data(Array.from(dataArray))
      .enter()
      .append('rect')
      .attr('x', (d, i) => xScale(String(i)) || 0)
      .attr('width', xScale.bandwidth())
      .attr('y', height)
      .attr('height', 0)
      .attr('fill', (d, i) => colorScale(i))
      .attr('rx', 2); // Rounded corners

    let animationId: number;

    const renderFrame = () => {
      animationId = requestAnimationFrame(renderFrame);
      analyser.getByteFrequencyData(dataArray);

      // We only visualize the lower half of frequencies for better aesthetic distribution
      const visualizeData = Array.from(dataArray).slice(0, Math.floor(bufferLength * 0.7)); 

      // Update scale domain for sliced data
      xScale.domain(d3.range(visualizeData.length).map(String));

      // Re-bind data
      const currentBars = svg.selectAll('rect')
        .data(visualizeData);

      // Enter/Update
      currentBars
        .attr('y', d => yScale(d))
        .attr('height', d => height - yScale(d))
        .attr('fill', (d, i) => {
           // Dynamic color based on intensity
           return d > 200 ? '#f472b6' : '#22d3ee'; // Pink if loud, Cyan otherwise
        });
        
      // Handle resize of bars count if needed (though usually fixed bin count)
      currentBars.enter()
        .append('rect')
        .merge(currentBars as any);
        
      currentBars.exit().remove();
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser]);

  return (
    <div className={`relative w-full h-full bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700 shadow-[0_0_15px_rgba(34,211,238,0.1)] ${className}`}>
      <svg ref={svgRef} className="w-full h-full" preserveAspectRatio="none" />
      {/* Scanlines overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
    </div>
  );
};

export default Visualizer;