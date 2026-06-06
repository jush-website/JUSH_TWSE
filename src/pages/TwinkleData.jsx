import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Database, Search, Play, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

const TwinkleData = () => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedTool, setSelectedTool] = useState(null);
  const [argsInput, setArgsInput] = useState('{}');
  const [callLoading, setCallLoading] = useState(false);
  const [callResult, setCallResult] = useState(null);
  const [callError, setCallError] = useState(null);

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/twinkle/tools');
      setTools(res.data.tools || []);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '無法載入工具列表');
    } finally {
      setLoading(false);
    }
  };

  const handleToolSelect = (tool) => {
    setSelectedTool(tool);
    setCallResult(null);
    setCallError(null);
    // 預填空參數 JSON
    const defaultArgs = {};
    if (tool.inputSchema?.properties) {
      Object.keys(tool.inputSchema.properties).forEach(key => {
        defaultArgs[key] = "";
      });
    }
    setArgsInput(JSON.stringify(defaultArgs, null, 2));
  };

  const handleCallTool = async () => {
    if (!selectedTool) return;
    
    setCallLoading(true);
    setCallError(null);
    setCallResult(null);
    
    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(argsInput);
    } catch (e) {
      setCallError('參數 JSON 格式錯誤');
      setCallLoading(false);
      return;
    }
    
    try {
      const res = await api.post('/api/twinkle/call', {
        tool_name: selectedTool.name,
        arguments: parsedArgs
      });
      setCallResult(res.data.result);
    } catch (err) {
      setCallError(err.response?.data?.detail || err.message || '執行失敗');
    } finally {
      setCallLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-indigo-500/20 rounded-xl">
          <Database size={28} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Twinkle Hub 公開資料庫
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            透過 MCP 協定，直接取用政府開放平台與各項公開數據
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-xl flex items-center space-x-3">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 工具列表 */}
        <div className="lg:col-span-1 bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 shadow-xl">
          <h2 className="text-lg font-bold text-gray-300 mb-4 flex items-center">
            <Search size={18} className="mr-2 text-indigo-400" />
            可用資料工具
          </h2>
          
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent"></div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {tools.map(tool => (
                <button
                  key={tool.name}
                  onClick={() => handleToolSelect(tool)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-200 border ${
                    selectedTool?.name === tool.name 
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' 
                      : 'bg-gray-900/50 border-gray-700/50 text-gray-400 hover:bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <div className="font-bold mb-1 truncate">{tool.name}</div>
                  <div className="text-xs opacity-70 line-clamp-2">{tool.description}</div>
                </button>
              ))}
              {tools.length === 0 && !error && (
                <div className="text-gray-500 text-center py-4">無可用工具</div>
              )}
            </div>
          )}
        </div>

        {/* 測試面板 */}
        <div className="lg:col-span-2 bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 shadow-xl flex flex-col">
          {selectedTool ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-indigo-300 mb-2">{selectedTool.name}</h2>
                <p className="text-gray-400 text-sm">{selectedTool.description}</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-300 mb-2">
                  執行參數 (JSON 格式)
                </label>
                <textarea
                  value={argsInput}
                  onChange={(e) => setArgsInput(e.target.value)}
                  className="w-full h-32 bg-gray-900 text-gray-300 p-3 rounded-xl border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono text-sm"
                  placeholder='{"param": "value"}'
                />
                
                {selectedTool.inputSchema?.properties && (
                  <div className="mt-2 text-xs text-gray-500">
                    <strong>可用欄位：</strong>
                    {Object.entries(selectedTool.inputSchema.properties).map(([key, prop]) => (
                      <span key={key} className="ml-2 inline-block bg-gray-800 px-2 py-1 rounded">
                        {key} ({prop.type})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end mb-6">
                <button
                  onClick={handleCallTool}
                  disabled={callLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition flex items-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                >
                  {callLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                  ) : (
                    <Play size={16} className="mr-2" />
                  )}
                  執行工具抓取資料
                </button>
              </div>

              <div className="flex-grow flex flex-col min-h-[300px]">
                <label className="block text-sm font-bold text-gray-300 mb-2">
                  執行結果
                </label>
                {callError && (
                  <div className="bg-red-900/30 text-red-400 p-3 rounded-xl border border-red-800 mb-4">
                    {callError}
                  </div>
                )}
                <div className="bg-gray-900 flex-grow rounded-xl border border-gray-700 p-4 overflow-auto font-mono text-sm text-gray-300 whitespace-pre-wrap">
                  {callResult ? (
                    JSON.stringify(callResult, null, 2)
                  ) : (
                    <span className="text-gray-600">等待執行...</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center text-gray-500 flex-col">
              <Database size={48} className="mb-4 opacity-20" />
              <p>請先從左側選擇一個資料工具</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TwinkleData;
