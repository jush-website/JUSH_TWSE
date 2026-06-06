import React from 'react';

const DataRenderer = ({ data, level = 0 }) => {
  if (data === null || data === undefined) {
    return <span className="text-gray-500 italic">無資料</span>;
  }

  if (typeof data === 'boolean') {
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${data ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
        {data ? 'TRUE' : 'FALSE'}
      </span>
    );
  }

  if (typeof data === 'string' || typeof data === 'number') {
    return <span className="text-gray-300 break-words">{data}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>;
    return (
      <div className="flex flex-col space-y-2 mt-1">
        {data.map((item, index) => (
          <div key={index} className="bg-gray-800/40 p-3 rounded-lg border border-gray-700/50">
            <DataRenderer data={item} level={level + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === 'object') {
    return (
      <div className="overflow-x-auto mt-1">
        <table className="w-full text-left border-collapse">
          <tbody>
            {Object.entries(data).map(([key, value], idx) => {
              // Hide internal metadata
              if (key === '_meta') return null;
              
              return (
                <tr key={key} className="border-b border-gray-700/30 last:border-0 hover:bg-gray-800/30 transition-colors">
                  <td className="py-2 pr-4 align-top w-1/4 sm:w-1/5 min-w-[120px]">
                    <span className="text-sm font-semibold text-indigo-300">{key}</span>
                  </td>
                  <td className="py-2 align-top">
                    <DataRenderer data={value} level={level + 1} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return <span>{String(data)}</span>;
};

export const TwinkleResultViewer = ({ rawResult }) => {
  if (!rawResult) return <span className="text-gray-600">等待執行...</span>;

  let parsedData = rawResult;
  let isTextExtracted = false;

  // Try to unwrap MCP response format: [{ type: "text", text: "{\"json\": ...}" }]
  if (Array.isArray(rawResult) && rawResult.length > 0 && rawResult[0].text) {
    try {
      parsedData = JSON.parse(rawResult[0].text);
      isTextExtracted = true;
    } catch (e) {
      parsedData = rawResult[0].text;
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 sm:p-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between border-b border-gray-800 pb-3">
        <h3 className="text-lg font-bold text-gray-200">執行結果解析</h3>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">Auto-Formatted</span>
      </div>
      <div className="custom-scrollbar overflow-x-auto max-h-[600px] overflow-y-auto">
        <DataRenderer data={parsedData} />
      </div>
    </div>
  );
};

export default TwinkleResultViewer;
