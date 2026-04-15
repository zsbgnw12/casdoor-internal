// Copyright 2021 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React from "react";
import {Tabs} from "antd";
import i18next from "i18next";
import LoginPage from "./LoginPage";
import CustomerLoginPage from "./CustomerLoginPage";
import {authConfig} from "./Auth";

class SelfLoginPage extends React.Component {
  constructor(props) {
    super(props);
    import("../ManagementPage");
    this.state = {activeTab: "customer"};
  }

  render() {
    const items = [
      {
        key: "customer",
        label: i18next.t("login:Customer login"),
        children: <CustomerLoginPage />,
      },
      {
        key: "internal",
        label: i18next.t("login:Internal login"),
        children: (
          <LoginPage type={"login"} mode={"signin"} applicationName={authConfig.appName} {...this.props} />
        ),
      },
    ];

    const wrapperStyle = {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    };

    const cardStyle = {
      width: "100%",
      maxWidth: "440px",
      padding: "36px 40px 28px",
      background: "rgba(255, 255, 255, 0.18)",
      backdropFilter: "blur(18px) saturate(140%)",
      WebkitBackdropFilter: "blur(18px) saturate(140%)",
      border: "1px solid rgba(255, 255, 255, 0.35)",
      borderRadius: "16px",
      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
      color: "#fff",
    };

    const brandStyle = {
      textAlign: "center",
      marginBottom: "20px",
      color: "#fff",
      fontSize: "26px",
      fontWeight: 700,
      letterSpacing: "4px",
      textShadow: "0 2px 8px rgba(0,0,0,0.45)",
    };

    return (
      <div style={wrapperStyle}>
        <div style={cardStyle} className="selfLoginCard">
          <div style={brandStyle}>认证中心</div>
          <Tabs
            centered
            size="large"
            activeKey={this.state.activeTab}
            onChange={(key) => this.setState({activeTab: key})}
            items={items}
          />
        </div>
      </div>
    );
  }
}

export default SelfLoginPage;
