import codecs

with codecs.open('src/frontend/pages/StockAnalysis.jsx', 'r', 'utf-8') as f:
    content = f.read()

old_fetch = """  const fetchAnalysis = async (searchQuery) => {
    if (!searchQuery) return;
    setLoading(true);
    setError(null);"""

new_fetch = """  const fetchAnalysis = async (searchQuery, isSilent = false) => {
    if (!searchQuery) return;
    if (!isSilent) {
      setLoading(true);
      setError(null);
    }"""
content = content.replace(old_fetch, new_fetch)

old_catch = """      setData(null);
    } finally {
      setLoading(false);
    }
  };"""

new_catch = """      if (!isSilent) setData(null);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };"""
content = content.replace(old_catch, new_catch)

old_effect = """  useEffect(() => {
    if (urlQuery) {
      fetchAnalysis(urlQuery);
    }
  }, [urlQuery]);"""

new_effect = """  useEffect(() => {
    if (urlQuery) {
      fetchAnalysis(urlQuery);
      
      const intervalId = setInterval(() => {
        fetchAnalysis(urlQuery, true);
      }, 3 * 60 * 1000); // 3 minutes polling
      
      return () => clearInterval(intervalId);
    }
  }, [urlQuery]);"""
content = content.replace(old_effect, new_effect)

with codecs.open('src/frontend/pages/StockAnalysis.jsx', 'w', 'utf-8') as f:
    f.write(content)
