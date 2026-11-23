function makePage({ page = 1, totalPages = 10, totalCount = 479, floors = [], post = {} } = {}) {
  return {
    status: 'success',
    post: {
      title: '赌坛风云',
      author: '揭育润',
      postTime: '2011-1-2 16:18',
      clickCount: 15413986,
      content: '楼主正文。',
      boardId: '1100',
      boardAlias: 'legend',
      threadDeleted: false,
      ...post
    },
    replies: {
      data: floors.map((floor, index) => ({
        pid: index + 1,
        replyId: 1000 + index,
        author: '揭育润',
        content: '楼层正文。',
        postTime: '2011-1-2 16:20',
        quotePid: null,
        deleted: false,
        ...floor
      })),
      pagination: { totalCount, totalPages, currentPage: page, pageSize: 50 }
    }
  };
}

module.exports = { makePage };
