import React, { useState, Fragment, useRef } from 'react';
import { formatDate } from '../../../../../src/services/format';
import { createDataStore } from '../data_store';

import {
  EuiBasicTable,
  EuiLink,
  EuiHealth,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
  EuiSpacer,
} from '../../../../../src/components';

/*
Example user object:

{
  id: '1',
  firstName: 'john',
  lastName: 'doe',
  github: 'johndoe',
  dateOfBirth: Date.now(),
  nationality: 'NL',
  online: true
}

Example country object:

{
  code: 'NL',
  name: 'Netherlands',
  flag: '🇳🇱'
}
*/

const store = createDataStore();

export const Table = () => {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sortField, setSortField] = useState('firstName');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedItems, setSelectedItems] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const tableRef = useRef();

  const onTableChange = ({ page = {}, sort = {} }) => {
    const { index: pageIndex, size: pageSize } = page;

    const { field: sortField, direction: sortDirection } = sort;

    setPageIndex(pageIndex);
    setPageSize(pageSize);
    setSortField(sortField);
    setSortDirection(sortDirection);
    if (isOnline) {
      setIsOnline(!isOnline);
    }
  };

  const onSelectionChange = selectedItems => {
    setSelectedItems(selectedItems);
  };

  const onClickDelete = () => {
    store.deleteUsers(...selectedItems.map(user => user.id));

    setSelectedItems([]);
  };

  const renderDeleteButton = () => {
    if (selectedItems.length === 0) {
      return;
    }

    return (
      <EuiButton color="danger" iconType="trash" onClick={onClickDelete}>
        Delete {selectedItems.length} Users
      </EuiButton>
    );
  };

  const renderStatus = online => {
    const color = online ? 'success' : 'danger';
    const label = online ? 'Online' : 'Offline';
    return <EuiHealth color={color}>{label}</EuiHealth>;
  };

  const { pageOfItems, totalItemCount } = store.findUsers(
    pageIndex,
    pageSize,
    sortField,
    sortDirection
  );

  const deleteButton = renderDeleteButton();

  const columns = [
    {
      field: 'firstName',
      name: 'First Name',
      sortable: true,
      truncateText: true,
      mobileOptions: {
        show: false,
      },
    },
    {
      field: 'lastName',
      name: 'Last Name',
      truncateText: true,
      mobileOptions: {
        show: false,
      },
    },
    {
      field: 'firstName',
      name: 'Full Name',
      mobileOptions: {
        only: true,
        header: false,
        enlarge: true,
        fullWidth: true,
      },
      render: (name, item) => (
        <EuiFlexGroup responsive={false} alignItems="center">
          <EuiFlexItem>
            {item.firstName} {item.lastName}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{renderStatus(item.online)}</EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      field: 'github',
      name: 'Github',
      render: username => (
        <EuiLink href={`https://github.com/${username}`} target="_blank">
          {username}
        </EuiLink>
      ),
    },
    {
      field: 'dateOfBirth',
      name: 'Date of Birth',
      dataType: 'date',
      render: date => formatDate(date, 'dobLong'),
      sortable: true,
    },
    {
      field: 'nationality',
      name: 'Nationality',
      render: countryCode => {
        const country = store.getCountry(countryCode);
        return `${country.flag} ${country.name}`;
      },
    },
    {
      field: 'online',
      name: 'Online',
      dataType: 'boolean',
      render: online => renderStatus(online),
      sortable: true,
      mobileOptions: {
        show: false,
      },
    },
  ];

  const pagination = {
    pageIndex: pageIndex,
    pageSize: pageSize,
    totalItemCount: totalItemCount,
    pageSizeOptions: [3, 5, 8],
  };

  const sorting = {
    sort: {
      field: sortField,
      direction: sortDirection,
    },
  };

  const initialSelectedUsers = store.users.filter(
    user => user.online && user.id < 10
  );

  const selection = {
    selectable: user => user.online,
    selectableMessage: selectable =>
      !selectable ? 'User is currently offline' : undefined,
    onSelectionChange: onSelectionChange,
    initialSelected: initialSelectedUsers,
  };

  const onlineUsers = store.users.filter(user => user.online);

  const toggleSelection = () => {
    if (!isOnline) {
      tableRef.current.setSelection(onlineUsers);
    } else {
      tableRef.current.setSelection([]);
    }
    setIsOnline(!isOnline);
  };

  return (
    <Fragment>
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="Select online users"
            checked={isOnline}
            onChange={toggleSelection}
          />
        </EuiFlexItem>
        <EuiFlexItem />
        {deleteButton}
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      <EuiBasicTable
        ref={tableRef}
        items={pageOfItems}
        itemId="id"
        columns={columns}
        pagination={pagination}
        sorting={sorting}
        isSelectable={true}
        selection={selection}
        onChange={onTableChange}
        rowHeader="firstName"
      />
    </Fragment>
  );
};
